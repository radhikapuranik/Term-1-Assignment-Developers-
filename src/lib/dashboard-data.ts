import { db, fetchAll } from "./db";
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
const RUN_COLS = "id,run_type,status,anchor,attempts,error,started_at,finished_at,source_status";

export async function loadDashboard(runId?: string): Promise<DashboardData> {
  const empty: DashboardData = {
    configured: true, loadError: null, latest: null, shown: null, brief: null, briefText: "", runs: [], spark: [], topics: [], settings: null, now: new Date().toISOString(),
  };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ...empty, configured: false };
  }
  try {
    const sb = db();
    const runsRes = await sb.from("runs").select(RUN_COLS).order("started_at", { ascending: false }).limit(40);
    if (runsRes.error) throw new Error(runsRes.error.message);
    const briefRuns = await sb.from("briefs").select("run_id").limit(500);
    const hasBrief = new Set((briefRuns.data ?? []).map((b) => b.run_id as string));
    const runs = ((runsRes.data ?? []) as RunSummary[]).map((r) => ({ ...r, has_brief: hasBrief.has(r.id) }));

    let shown: RunSummary | null = null;
    if (runId) {
      const r = await sb.from("runs").select(RUN_COLS).eq("id", runId).maybeSingle();
      shown = (r.data as RunSummary | null) ?? null;
      if (!shown) return { ...empty, runs, latest: runs[0] ?? null, notFound: true };
    } else {
      shown = runs.find((r) => hasBrief.has(r.id)) ?? null;
    }

    let brief: DashboardData["brief"] = null;
    if (shown) {
      const b = await sb.from("briefs").select("content,email_status,email_sent_at,email_error").eq("run_id", shown.id).maybeSingle();
      if (b.data) brief = b.data as NonNullable<DashboardData["brief"]>;
    }

    const topicsRes = await sb.from("topics").select("*").eq("active", true).order("category").order("id");
    const settingsRes = await sb.from("settings").select("key,value");
    const sm = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key as string, r.value]));

    const sparkRunIds = runs.filter((r) => hasBrief.has(r.id)).slice(0, 12).map((r) => r.id);
    const anchors = new Map(runs.map((r) => [r.id, r.anchor]));
    let spark: SparkPoint[] = [];
    if (sparkRunIds.length) {
      const rows = await fetchAll<{ run_id: string; category: string; current_count: number; data_status: "complete" | "incomplete" }>((a, z) =>
        sb.from("weekly_stats").select("run_id,category,current_count,data_status").eq("level", "category").in("run_id", sparkRunIds).range(a, z),
      );
      spark = rows.map((r) => ({ ...r, anchor: anchors.get(r.run_id) ?? "" }));
    }

    return {
      ...empty,
      latest: runs[0] ?? null,
      shown,
      brief,
      briefText: brief ? renderText(brief.content, appUrl()) : "",
      runs,
      spark,
      topics: (topicsRes.data ?? []) as Topic[],
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
