import { collectPosts } from "./collect";
import { insertBackfillRun, insertStats, loadConfig, loadWindowData, upsertFetchedPosts, upsertMatches } from "./db";
import { summarizeSources } from "./health";
import { computeStats, verifyMatches } from "./stats";
import { windowsFor } from "./windows";
import { postKey, SOURCE_NAMES, SOURCES } from "./types";

export interface BackfillResult {
  topic_id: number;
  keyword: string;
  category: string;
  current_count: number;
  previous_count: number;
  pct_change: number | null;
  trend_label: string;
  no_baseline: boolean;
  posts_saved: number;
  sources: Array<{ source: string; ok: boolean; message: string }>;
  run_id: string;
}

/**
 * Fetches the last 14 days for ONE keyword from the three sources, matches it in code, saves the posts and
 * the weekly counts for this week and last week, so the trend shows right away. No Gemini call.
 * If a source fails, the numbers say so ("no baseline") instead of guessing.
 */
export async function backfillTopic(topicId: number): Promise<BackfillResult> {
  const { topics, settings } = await loadConfig();
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) throw new Error("That keyword is switched off, so it is not backfilled. Switch it on first.");
  const anchor = new Date();
  const w = windowsFor(anchor);

  const { posts, outcomes } = await collectPosts([topic], settings, w.fetchFrom, anchor);
  const matches = verifyMatches(posts, [topic]);
  const keys = new Set(matches.map((m) => postKey(m.source, m.post_id)));
  const now = new Date().toISOString();
  await upsertFetchedPosts(posts.filter((p) => keys.has(postKey(p.source, p.post_id))).map((p) => ({ ...p, fetched_at: now })));
  await upsertMatches(matches);

  const { matches: stored } = await loadWindowData(w.fetchFrom, anchor);
  const stats = computeStats({ matches: stored, activeTopics: topics, windows: w, settings, outcomes });
  const mine = stats.rows.filter((r) => (r.level === "keyword" && r.topic_id === topic.id) || (r.level === "category" && r.category_id === topic.category_id));
  const kwRow = mine.find((r) => r.level === "keyword")!;

  const ss = summarizeSources(outcomes);
  const allOk = outcomes.every((o) => o.ok);
  const runId = await insertBackfillRun(anchor, allOk ? "sent" : "partial", ss);
  await insertStats(runId, mine as unknown as Array<Record<string, unknown>>);

  return {
    topic_id: topic.id,
    keyword: topic.keyword,
    category: topic.category,
    current_count: kwRow.current_count,
    previous_count: kwRow.previous_count,
    pct_change: kwRow.pct_change,
    trend_label: kwRow.trend_label,
    no_baseline: kwRow.data_status === "incomplete",
    posts_saved: keys.size,
    sources: SOURCES.map((s) => {
      const x = ss.sources[s];
      return { source: SOURCE_NAMES[s], ok: x.status === "ok", message: x.status === "ok" ? `OK, ${x.posts} posts looked at` : x.status === "failed" ? "did not respond, so no baseline" : `partly failed (${x.failed} of ${x.requests} requests), so no baseline` };
    }),
    run_id: runId,
  };
}
