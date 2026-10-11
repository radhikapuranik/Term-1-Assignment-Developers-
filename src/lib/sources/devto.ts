import { getJson } from "../http";
import { simulated } from "../simulate";
import { snippet, decodeEntities } from "../text";
import type { RawPost, RequestOutcome } from "../types";

interface DevtoArticle {
  id: number;
  title: string;
  description: string | null;
  url: string;
  published_at: string;
  comments_count: number;
  public_reactions_count: number;
  tag_list: string[] | string;
}

const MAX_PAGES = 5;

/**
 * Dev.to has no keyword search, so we page through one tag until a whole page is older than
 * `from` (the feed is roughly newest first, so we stop on a page, not on one old article).
 */
export async function fetchDevtoTag(
  tag: string,
  from: Date,
  to: Date,
): Promise<{ posts: RawPost[]; outcome: RequestOutcome }> {
  const fail = (error: string, retries = 0) => ({
    posts: [] as RawPost[],
    outcome: { source: "devto" as const, target: tag, ok: false, count: 0, retries, error },
  });
  if (simulated("devto")) return fail("simulated failure (SIMULATE_FAIL=devto)");

  const posts: RawPost[] = [];
  let retries = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await getJson<DevtoArticle[]>(
      `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=100&page=${page}`,
    );
    retries += r.retries;
    if (!r.ok || !r.data) return fail(r.error ?? "request failed", retries);
    if (r.data.length === 0) break;
    let newest = 0;
    for (const a of r.data) {
      const t = new Date(a.published_at).getTime();
      newest = Math.max(newest, t);
      if (t < from.getTime() || t >= to.getTime()) continue;
      const tags = Array.isArray(a.tag_list) ? a.tag_list : String(a.tag_list ?? "").split(/,\s*/).filter(Boolean);
      posts.push({
        source: "devto",
        post_id: String(a.id),
        title: decodeEntities(a.title),
        snippet: snippet(a.description),
        url: a.url,
        created_at: new Date(t).toISOString(),
        comments: a.comments_count ?? 0,
        score: a.public_reactions_count ?? 0,
        answer_count: null,
        has_accepted_answer: null,
        tags,
      });
    }
    if (newest < from.getTime()) break;
  }
  return { posts, outcome: { source: "devto", target: tag, ok: true, count: posts.length, retries } };
}
