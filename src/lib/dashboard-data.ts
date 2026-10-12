import { dbConfigured, q } from "./db";
import type { BriefContent } from "./brief";
import type { SourceStatus } from "./health";
import { renderText } from "./render";
import { applyLiveTopics, type BackfillRow } from "./overlay";
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
  category_id: number;
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

/** `overlay` (the live dashboard only) applies renames and backfilled keywords on top of the latest stored brief. */
export async function loadDashboard(runId?: string, opts: { overlay?: boolean } = {}): Promise<DashboardData> {
  const empty: DashboardData = {
    configured: true, loadError: null, latest: null, shown: null, brief: null, briefText: "", runs: [], spark: [], topics: [], settings: null, now: new Date().toISOString(),
  };
  if (!dbConfigured()) return { ...empty, configured: false };
  try {
    const [briefIds, runRows, categoryRows, topicRows, settingRows] = await Promise.all([
      q<{ run_id: string }>("select run_id from briefs"),
      q<RunSummary>(`select ${RUN_COLS} from runs where run_type <> 'backfill' order by started_at desc limit 40`),
      q<{ id: number; name: string; active: boolean }>("select id, name, active from categories"),
      q<{ id: number; category_id: number; keyword: string; active: boolean; created_at: string }>("select id, category_id, keyword, active, created_at from topics order by id"),
      q<{ key: string; value: unknown }>("select key, value from settings"),
    ]);
    const hasBrief = new Set(briefIds.map((b) => b.run_id));
    const runs = runRows.map((r) => ({ ...r, has_brief: hasBrief.has(r.id) }));
    const sm = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
    const catName = new Map(categoryRows.map((c) => [c.id, c]));
    const topics: Topic[] = topicRows
      .filter((t) => t.active && catName.get(t.category_id)?.active)
      .map((t) => ({ ...t, category: catName.get(t.category_id)!.name }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);

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

    // History: earlier scheduled weeks only (older than last week). Last week and this week come from the shown brief itself.
    const cutoff = shown ? new Date(shown.anchor).getTime() - 7 * 24 * 3600 * 1000 - 3600 * 1000 : 0;
    const sparkRunIds = runs
      .filter((r) => r.run_type === "scheduled" && hasBrief.has(r.id) && new Date(r.anchor).getTime() < cutoff)
      .sort((a, b) => b.anchor.localeCompare(a.anchor)).slice(0, 10).map((r) => r.id);
    const anchors = new Map(runs.map((r) => [r.id, r.anchor]));
    const sparkPromise = sparkRunIds.length
      ? q<{ run_id: string; category_id: number; current_count: number; data_status: "complete" | "incomplete" }>(
          "select run_id, category_id, current_count, data_status from weekly_stats where level = 'category' and run_id = any($1::uuid[])",
          [sparkRunIds],
        )
      : Promise.resolve([]);
    const [briefRows, sparkRows] = await Promise.all([briefPromise, sparkPromise]);
    let brief: DashboardData["brief"] = briefRows[0] ?? null;
    if (brief && shown) {
      let backfill: BackfillRow[] = [];
      if (opts.overlay) {
        const rows = await q<Omit<BackfillRow, "pct_change"> & { pct_change: string | null }>(
          `select w.level, w.category_id, w.topic_id, w.current_count, w.previous_count, w.pct_change, w.trend_label, w.data_status
             from weekly_stats w join runs r on r.id = w.run_id
            where r.run_type = 'backfill' and r.started_at > $1 order by r.started_at asc`,
          [shown.started_at],
        );
        backfill = rows.map((r) => ({ ...r, pct_change: r.pct_change === null ? null : Number(r.pct_change) }));
      }
      brief = { ...brief, content: applyLiveTopics(brief.content, categoryRows, topicRows, backfill) };
    }
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
