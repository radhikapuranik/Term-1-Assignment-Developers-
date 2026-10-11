import type { PostRow, Source } from "./types";

export interface UnresolvedItem {
  source: Source;
  post_id: string;
  title: string;
  url: string;
  reason: string;
  created_at: string;
  fetched_at: string;
}

export const REASON_SO_NONE = "No answers on Stack Overflow at the time of fetch";
export const REASON_SO_UNANSWERED = "No accepted or upvoted answer on Stack Overflow at the time of fetch";
export const REASON_HN = "Few replies on Hacker News";
export const REASON_DEVTO = "No comments on a Dev.to help or discussion post at the time of fetch";

/**
 * Source-specific evidence only. We never read replies, so this says "potentially unresolved",
 * never "unsolved". Gemini's seeking_help flag cannot add a post on its own: it only counts
 * together with a source signal (few replies on Hacker News).
 */
export function unresolvedReason(p: PostRow): string | null {
  if (p.relevant === false) return null;
  if (p.source === "so") {
    if (p.answer_count === 0) return REASON_SO_NONE;
    if (p.has_accepted_answer === false) return REASON_SO_UNANSWERED;
    return null;
  }
  if (p.source === "hn") {
    const fewReplies = (p.comments ?? 0) <= 1;
    const questionOrComplaint = p.seeking_help === true || p.sentiment === "negative";
    return fewReplies && questionOrComplaint ? REASON_HN : null;
  }
  if (p.source === "devto") {
    const tags = (p.tags ?? []).map((t) => t.toLowerCase());
    const helpOrDiscuss = tags.includes("help") || tags.includes("discuss");
    return helpOrDiscuss && (p.comments ?? 0) === 0 ? REASON_DEVTO : null;
  }
  return null;
}

export function findUnresolved(posts: PostRow[]): UnresolvedItem[] {
  const out: UnresolvedItem[] = [];
  for (const p of posts) {
    const reason = unresolvedReason(p);
    if (!reason) continue;
    out.push({
      source: p.source,
      post_id: p.post_id,
      title: p.title,
      url: p.url,
      reason,
      created_at: p.created_at,
      fetched_at: p.fetched_at,
    });
  }
  const rank = (r: string) => (r === REASON_SO_NONE ? 0 : r === REASON_SO_UNANSWERED ? 2 : 1);
  return out.sort((a, b) => rank(a.reason) - rank(b.reason) || b.created_at.localeCompare(a.created_at));
}
