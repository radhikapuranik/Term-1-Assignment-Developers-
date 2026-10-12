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

const SHOW_HN = /^\s*(show|launch)\s+hn\b/i;
const ANNOUNCEMENT = /\b(announcing|introducing|now available|now ga|release notes|changelog|case study|our journey|we(?:'re| are) (?:launching|excited|hiring)|how we (?:built|made|cut|reduced|scaled|saved))\b|\bv\d+\.\d+/i;
const BLOG_TAGS = new Set(["announcement", "announcements", "news", "showdev", "release", "changelog", "tutorial", "career"]);

/** Show HN posts and blog or announcement posts are not people asking for help. */
export function isShowcaseOrBlog(p: Pick<PostRow, "title" | "tags">): boolean {
  return SHOW_HN.test(p.title) || ANNOUNCEMENT.test(p.title) || (p.tags ?? []).some((t) => BLOG_TAGS.has(t.toLowerCase()));
}

/** A question or a complaint: Gemini's seeking_help or negative sentiment, or a question in the title. */
export function hasQuestionOrComplaint(p: Pick<PostRow, "title" | "seeking_help" | "sentiment">): boolean {
  return p.seeking_help === true || p.sentiment === "negative" || /\?\s*$/.test(p.title);
}

/**
 * Source-specific evidence only. We never read replies, so this says "potentially unresolved",
 * never "unsolved". Show HN and blog or announcement posts are excluded, and every candidate needs a
 * question or complaint signal (a Stack Overflow post is a question by nature). Gemini's seeking_help
 * flag can never add a post on its own: it only counts together with a source signal (few replies).
 */
export function unresolvedReason(p: PostRow): string | null {
  if (p.relevant === false || isShowcaseOrBlog(p)) return null;
  if (p.source === "so") {
    if (p.answer_count === 0) return REASON_SO_NONE;
    if (p.has_accepted_answer === false) return REASON_SO_UNANSWERED;
    return null;
  }
  if (!hasQuestionOrComplaint(p)) return null;
  if (p.source === "hn") return (p.comments ?? 0) <= 1 ? REASON_HN : null;
  if (p.source === "devto") {
    const tags = (p.tags ?? []).map((t) => t.toLowerCase());
    return (tags.includes("help") || tags.includes("discuss")) && (p.comments ?? 0) === 0 ? REASON_DEVTO : null;
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
