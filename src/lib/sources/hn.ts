import { getJson } from "../http";
import { simulated } from "../simulate";
import { snippet, decodeEntities } from "../text";
import type { RawPost, RequestOutcome } from "../types";

interface HnHit {
  objectID: string;
  title: string | null;
  story_text: string | null;
  created_at_i: number;
  num_comments: number | null;
  points: number | null;
}
interface HnResponse {
  hits: HnHit[];
  nbPages: number;
}

const MAX_PAGES = 3;

/** Stories only, quoted phrase search. One outcome per keyword (ok only if every page worked). */
export async function fetchHn(
  keyword: string,
  from: Date,
  to: Date,
): Promise<{ posts: RawPost[]; outcome: RequestOutcome }> {
  const fail = (error: string, retries = 0) => ({
    posts: [] as RawPost[],
    outcome: { source: "hn" as const, target: keyword, ok: false, count: 0, retries, error },
  });
  if (simulated("hn")) return fail("simulated failure (SIMULATE_FAIL=hn)");

  const posts: RawPost[] = [];
  let retries = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query: `"${keyword}"`,
      tags: "story",
      numericFilters: `created_at_i>=${Math.floor(from.getTime() / 1000)},created_at_i<${Math.floor(to.getTime() / 1000)}`,
      hitsPerPage: "100",
      advancedSyntax: "true",
      page: String(page),
    });
    const r = await getJson<HnResponse>(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
    retries += r.retries;
    if (!r.ok || !r.data) return fail(r.error ?? "request failed", retries);
    for (const h of r.data.hits) {
      if (!h.title) continue;
      const title = decodeEntities(h.title);
      posts.push({
        source: "hn",
        post_id: h.objectID,
        title,
        snippet: snippet(h.story_text) ?? title.slice(0, 400),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        created_at: new Date(h.created_at_i * 1000).toISOString(),
        comments: h.num_comments ?? 0,
        score: h.points ?? 0,
        answer_count: null,
        has_accepted_answer: null,
        tags: null,
      });
    }
    if (page + 1 >= r.data.nbPages) break;
  }
  return { posts, outcome: { source: "hn", target: keyword, ok: true, count: posts.length, retries } };
}
