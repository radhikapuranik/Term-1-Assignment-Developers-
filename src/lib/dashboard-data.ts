import { dbConfigured, q } from "./db";
import type { BriefContent } from "./brief";
import type { SourceStatus } from "./health";
import { renderText } from "./render";
import type { Settings, Topic } from "./types";

export interface RunSummary {
  id: string;
  run_type: "scheduled" | "manual";
  status: "running" | "sent" | "partial" | "failed";
  anchor: string;
  attempts: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  source_status: SourceStatus | null;
  stage?: string | null;
  has_brief?: boolean;
}

export interface SparkPoint {
  run_id: string;
  anchor: string;
  category: string;
  current_count: number;
  data_status: "complete" | "incomplete";
}

export interface DashboardData {
  configured: boolean;
  loadError: string | null;
  latest: RunSummary | null; // newest run of any status
  shown: RunSummary | null; // run whose brief is displayed
  brief: { content: BriefContent; email_status: string; email_sent_at: string | null; email_error: string | null } | null;
  briefText: string;
  runs: RunSummary[];
  spark: SparkPoint[];
  topics: Topic[];
  settings: Pick<Settings, "min_mentions" | "flat_threshold_pct" | "recipient_email"> | null;
  notFound?: boolean;
  now: string;
}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RUN_COLS = "id,run_type,status,anchor,attempts,error,started_at,finished_at,source_status,stage";

export async function loadDashboard(runId?: string): Promise<DashboardData> {
  const empty: DashboardData = {
    configured: true, loadError: null, latest: null, shown: null, brief: null, briefText: "", runs: [], spark: [], topics: [], settings: null, now: new Date().toISOString(),
  };
  if (!dbConfigured()) return { ...empty, configured: false };
  try {
    const [briefIds, runRows, topics, settingRows] = await Promise.all([
      q<{ run_id: string }>("select run_id from briefs"),
      q<RunSummary>(`select ${RUN_COLS} from runs order by started_at desc limit 40`),
      q<Topic>("select * from topics where active order by category, id"),
      q<{ key: string; value: unknown }>("select key, value from settings"),
    ]);
    const hasBrief = new Set(briefIds.map((b) => b.run_id));
    const runs = runRows.map((r) => ({ ...r, has_brief: hasBrief.has(r.id) }));
    const sm = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

    let shown: RunSummary | null = null;
    if (runId) {
      const r = (await q<RunSummary>(`select ${RUN_COLS} from runs where id = $1`, [runId]))[0];
      shown = r ?? null;
      if (!shown) return { ...empty, runs, latest: runs[0] ?? null, notFound: true };
    } else {
      shown = runs.find((r) => hasBrief.has(r.id)) ?? null;
    }

    const briefPromise = shown
      ? q<NonNullable<DashboardData["brief"]>>("select content, email_status, email_sent_at, email_error from briefs where run_id = $1", [shown.id])
      : Promise.resolve([]);

    const sparkRunIds = runs.filter((r) => hasBrief.has(r.id)).slice(0, 12).map((r) => r.id);
    const anchors = new Map(runs.map((r) => [r.id, r.anchor]));
    const sparkPromise = sparkRunIds.length
      ? q<{ run_id: string; category: string; current_count: number; data_status: "complete" | "incomplete" }>(
          "select run_id, category, current_count, data_status from weekly_stats where level = 'category' and run_id = any($1::uuid[])",
          [sparkRunIds],
        )
      : Promise.resolve([]);
    const [briefRows, sparkRows] = await Promise.all([briefPromise, sparkPromise]);
    const brief: DashboardData["brief"] = briefRows[0] ?? null;
    const spark: SparkPoint[] = sparkRows.map((r) => ({ ...r, anchor: anchors.get(r.run_id) ?? "" }));

    return {
      ...empty,
      latest: runs[0] ?? null,
      shown,
      brief,
      briefText: brief ? renderText(brief.content, appUrl()) : "",
      runs,
      spark,
      topics,
      settings: {
        min_mentions: Number(sm.min_mentions ?? 5),
        flat_threshold_pct: Number(sm.flat_threshold_pct ?? 10),
        recipient_email: String(sm.recipient_email ?? ""),
      },
    };
  } catch (e) {
    return { ...empty, loadError: (e as Error).message };
  }
}
