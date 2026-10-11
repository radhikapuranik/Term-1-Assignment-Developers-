import { fetchHn } from "./sources/hn";
import { fetchDevtoTag } from "./sources/devto";
import { fetchSo } from "./sources/so";
import type { RawPost, RequestOutcome, Topic, Settings } from "./types";

/** One fetch per run covering both windows: [fetchFrom, anchor). Every request outcome is kept. */
export async function collectPosts(
  topics: Pick<Topic, "keyword">[],
  settings: Pick<Settings, "devto_tags">,
  from: Date,
  to: Date,
): Promise<{ posts: RawPost[]; outcomes: RequestOutcome[] }> {
  const keywords = [...new Set(topics.map((t) => t.keyword))];
  const jobs: Array<Promise<{ posts: RawPost[]; outcome: RequestOutcome }>> = [
    ...keywords.map((k) => fetchHn(k, from, to)),
    ...settings.devto_tags.map((t) => fetchDevtoTag(t, from, to)),
    ...keywords.map((k) => fetchSo(k, from, to)),
  ];
  // The shared limiter in http.ts keeps at most 4 requests in flight.
  const results = await Promise.all(jobs);
  const byKey = new Map<string, RawPost>();
  for (const r of results) for (const p of r.posts) byKey.set(`${p.source}:${p.post_id}`, p);
  return { posts: [...byKey.values()], outcomes: results.map((r) => r.outcome) };
}
