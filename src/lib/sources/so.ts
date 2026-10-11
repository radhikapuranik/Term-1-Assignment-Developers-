import { getJson, sleep } from "../http";
import { simulated } from "../simulate";
import { snippet, decodeEntities } from "../text";
import type { RawPost, RequestOutcome } from "../types";

interface SeItem {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  creation_date: number;
  answer_count: number;
  is_answered: boolean;
  score: number;
  tags: string[];
}
interface SeResponse {
  items: SeItem[];
  has_more: boolean;
  backoff?: number;
  quota_remaining?: number;
}

const MAX_PAGES = 3;
let notBefore = 0; // Stack Exchange asks us to wait when it returns a `backoff` field

/** has_accepted_answer holds Stack Exchange's `is_answered` (an accepted or upvoted answer exists). */
export async function fetchSo(
  keyword: string,
  from: Date,
  to: Date,
): Promise<{ posts: RawPost[]; outcome: RequestOutcome }> {
  const fail = (error: string, retries = 0) => ({
    posts: [] as RawPost[],
    outcome: { source: "so" as const, target: keyword, ok: false, count: 0, retries, error },
  });
  if (simulated("se")) return fail("simulated failure (SIMULATE_FAIL=se)");

  const posts: RawPost[] = [];
  let retries = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const wait = notBefore - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 15000));
    const params = new URLSearchParams({
      site: "stackoverflow",
      q: keyword,
      fromdate: String(Math.floor(from.getTime() / 1000)),
      todate: String(Math.floor(to.getTime() / 1000) - 1), // todate is inclusive; our window is half-open
      sort: "creation",
      order: "desc",
      pagesize: "100",
      page: String(page),
      filter: "withbody",
    });
    if (process.env.STACKEXCHANGE_KEY) params.set("key", process.env.STACKEXCHANGE_KEY);
    const r = await getJson<SeResponse>(`https://api.stackexchange.com/2.3/search/advanced?${params}`);
    retries += r.retries;
    if (!r.ok || !r.data) return fail(r.error ?? "request failed", retries);
    if (r.data.backoff) notBefore = Math.max(notBefore, Date.now() + r.data.backoff * 1000);
    for (const q of r.data.items) {
      posts.push({
        source: "so",
        post_id: String(q.question_id),
        title: decodeEntities(q.title),
        snippet: snippet(q.body),
        url: q.link,
        created_at: new Date(q.creation_date * 1000).toISOString(),
        comments: null,
        score: q.score ?? 0,
        answer_count: q.answer_count ?? 0,
        has_accepted_answer: q.is_answered ?? false,
        tags: q.tags ?? null,
      });
    }
    if (!r.data.has_more) break;
  }
  return { posts, outcome: { source: "so", target: keyword, ok: true, count: posts.length, retries } };
}
