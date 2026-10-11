// Proves the three live sources work and the counting code runs on real data. No database or keys needed
// (Stack Exchange works without a key at low volume). Usage: npx tsx scripts/live-check.ts
import { collectPosts } from "../src/lib/collect";
import { scheduledAnchor, windowsFor } from "../src/lib/windows";
import { verifyMatches, computeStats } from "../src/lib/stats";
import type { Topic } from "../src/lib/types";

const seed: Array<[string, string[]]> = [
  ["Code review process and culture", ["code review", "pull request review", "review turnaround"]],
  ["False positives and noisy tooling", ["false positive", "linter noise", "alert fatigue"]],
  ["CI/CD pipeline pain", ["flaky tests", "slow CI", "GitHub Actions", "CI/CD"]],
  ["Developer workflow and productivity", ["developer productivity", "developer workflow", "context switching"]],
  ["AI code review tools", ["AI code review", "automated code review", "Copilot review"]],
];
const topics = seed.flatMap(([category, kws]) => kws.map((keyword, i) => ({ category, keyword, id: i, active: true, created_at: "2020-01-01T00:00:00Z" }) as Topic));
const tags = ["codereview", "cicd", "devops", "githubactions", "testing", "productivity", "softwareengineering"];

const anchor = scheduledAnchor(new Date());
const w = windowsFor(anchor);
console.log("anchor", anchor.toISOString(), "current", w.current.from.toISOString(), "->", w.current.to.toISOString());
const t0 = Date.now();
const { posts, outcomes } = await collectPosts(topics, { devto_tags: tags }, w.fetchFrom, anchor);
console.log(`fetched ${posts.length} unique posts in ${Date.now() - t0} ms`);
for (const s of ["hn", "devto", "so"] as const) {
  const o = outcomes.filter((x) => x.source === s);
  console.log(s, `requests=${o.length} ok=${o.filter((x) => x.ok).length} failed=${o.filter((x) => !x.ok).length} posts=${o.reduce((a, x) => a + x.count, 0)} retries=${o.reduce((a, x) => a + x.retries, 0)}`, o.filter((x) => !x.ok).map((x) => `${x.target}:${x.error}`));
}
const matches = verifyMatches(posts, topics).map((m) => ({ ...m, created_at: posts.find((p) => p.source === m.source && p.post_id === m.post_id)!.created_at }));
const stats = computeStats({ matches, activeTopics: topics, windows: w, settings: { min_mentions: 5, flat_threshold_pct: 10 }, outcomes });
console.log("overall unique posts: this week", stats.totals.current, "last week", stats.totals.previous);
for (const r of stats.rows.filter((r) => r.level === "category")) console.log(`${r.category.padEnd(40)} ${r.current_count} vs ${r.previous_count}  ${r.pct_change ?? "-"}%  ${r.trend_label}`);
for (const r of stats.rows.filter((r) => r.level === "keyword")) console.log(`  ${r.keyword.padEnd(26)} ${r.current_count} vs ${r.previous_count}  ${r.trend_label}`);
