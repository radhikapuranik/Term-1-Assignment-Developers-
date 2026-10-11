import { geminiJson, geminiModel } from "./gemini";
import { BriefOutputSchema, checkBrief, type CheckedBrief } from "./validate";
import { labelToKind } from "./trend";
import { postKey, SOURCE_NAMES, type PostRow, type RequestOutcome, type Source, type StatRow, type Topic, type TrendKind } from "./types";
import type { MatchRow } from "./stats";
import type { UnresolvedItem } from "./unresolved";
import { windowSentence } from "./format";

export interface EvidenceLink {
  source: Source;
  post_id: string;
  title: string;
  url: string;
  created_at: string;
}

export interface BriefKeyword {
  keyword: string;
  current_count: number;
  previous_count: number;
  pct_change: number | null;
  trend_label: string;
  data_status: "complete" | "incomplete";
}

export interface BriefCategory {
  category: string;
  current_count: number;
  previous_count: number;
  pct_change: number | null;
  trend_label: string;
  trend_kind: TrendKind;
  data_status: "complete" | "incomplete";
  recently_added: boolean;
  headline: string | null;
  keywords: BriefKeyword[];
  evidence: EvidenceLink[]; // best posts this week, resolved from the database
  pain_points: Array<{ label: string; evidence: EvidenceLink[] }>;
  opportunities: Array<{ text: string; evidence: EvidenceLink[] }>;
}

export interface BriefContent {
  version: 1;
  generated_at: string;
  anchor: string;
  window_sentence: string;
  totals: { current: number; previous: number };
  executive_summary: string | null;
  ai: { status: "ok" | "unavailable"; model: string | null; reason: string | null; classified: number; unclassified: number };
  categories: BriefCategory[];
  unresolved: UnresolvedItem[];
  data_quality: string[];
}

const engagement = (p: PostRow) => (p.comments ?? p.answer_count ?? 0) + (p.score ?? 0);

function link(p: PostRow): EvidenceLink {
  return { source: p.source, post_id: p.post_id, title: p.title, url: p.url, created_at: p.created_at };
}

/** The best evidence posts for a category this week: relevant ones, most-engaged first. */
export function evidenceFor(category: string, posts: PostRow[], matches: MatchRow[], currentFrom: Date, currentTo: Date, max: number): PostRow[] {
  const ids = new Set(matches.filter((m) => m.category === category).map((m) => postKey(m.source, m.post_id)));
  return posts
    .filter((p) => ids.has(postKey(p.source, p.post_id)) && p.relevant !== false)
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= currentFrom.getTime() && t < currentTo.getTime();
    })
    .sort((a, b) => engagement(b) - engagement(a) || b.created_at.localeCompare(a.created_at))
    .slice(0, max);
}

export function dataQualityNotes(outcomes: RequestOutcome[]): string[] {
  const notes: string[] = [];
  for (const s of ["hn", "devto", "so"] as Source[]) {
    const failed = outcomes.filter((o) => o.source === s && !o.ok);
    if (failed.length === 0) continue;
    const all = outcomes.filter((o) => o.source === s).length;
    const what = failed.slice(0, 3).map((f) => `${f.target} (${f.error ?? "failed"})`).join(", ");
    notes.push(
      `Data unavailable: ${SOURCE_NAMES[s]} did not respond for ${failed.length} of ${all} requests${what ? `: ${what}` : ""}. Affected categories show no trend.`,
    );
  }
  return notes;
}

/** Everything the code knows, with no AI commentary. This is also the complete stats-only brief. */
export function assembleBase(args: {
  anchor: Date;
  now: Date;
  topics: Topic[];
  stats: StatRow[];
  totals: { current: number; previous: number };
  posts: PostRow[];
  matches: MatchRow[];
  unresolved: UnresolvedItem[];
  outcomes: RequestOutcome[];
  currentFrom: Date;
  classified: number;
  unclassified: number;
}): BriefContent {
  const fourteen = 14 * 24 * 3600 * 1000;
  const cats = [...new Set(args.topics.map((t) => t.category))];
  const categories: BriefCategory[] = cats.map((c) => {
    const row = args.stats.find((s) => s.level === "category" && s.category === c)!;
    return {
      category: c,
      current_count: row.current_count,
      previous_count: row.previous_count,
      pct_change: row.pct_change,
      trend_label: row.trend_label,
      trend_kind: labelToKind(row.trend_label),
      data_status: row.data_status,
      recently_added: args.topics.some((t) => t.category === c && args.now.getTime() - new Date(t.created_at).getTime() < fourteen),
      headline: null,
      keywords: args.stats
        .filter((s) => s.level === "keyword" && s.category === c)
        .map((s) => ({
          keyword: s.keyword,
          current_count: s.current_count,
          previous_count: s.previous_count,
          pct_change: s.pct_change,
          trend_label: s.trend_label,
          data_status: s.data_status,
        })),
      evidence: evidenceFor(c, args.posts, args.matches, args.currentFrom, args.anchor, 5).map(link),
      pain_points: [],
      opportunities: [],
    };
  });
  categories.sort((a, b) => b.current_count - a.current_count || a.category.localeCompare(b.category));
  return {
    version: 1,
    generated_at: args.now.toISOString(),
    anchor: args.anchor.toISOString(),
    window_sentence: windowSentence(args.anchor),
    totals: args.totals,
    executive_summary: null,
    ai: { status: "unavailable", model: null, reason: null, classified: args.classified, unclassified: args.unclassified },
    categories,
    unresolved: args.unresolved,
    data_quality: dataQualityNotes(args.outcomes),
  };
}

const BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: {
    executive_summary: { type: "STRING" },
    categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          headline: { type: "STRING" },
          top_pain_points: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { label: { type: "STRING" }, post_ids: { type: "ARRAY", items: { type: "STRING" } } },
              required: ["label", "post_ids"],
            },
          },
          product_opportunities: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { text: { type: "STRING" }, post_ids: { type: "ARRAY", items: { type: "STRING" } } },
              required: ["text", "post_ids"],
            },
          },
        },
        required: ["category", "headline", "top_pain_points", "product_opportunities"],
      },
    },
  },
  required: ["executive_summary", "categories"],
};

const SYSTEM = `You write the analysis section of a weekly developer-community brief for the product manager of a code review automation tool.
You are given statistics that were calculated by code, and evidence posts from Hacker News, Dev.to and Stack Overflow.
STRICT RULES:
- Use only the data supplied. Cite evidence only by the composite post id (for example "hn:123"), copied exactly from the input.
- Never write any digit, number, percentage or URL in any text field. Refer to size in words such as "several" or "a few" only if the supplied counts support it, or avoid size words.
- Direction words must match the supplied trend_label for that category. Only describe a category as rising if its trend_label is "Up", falling if "Down" or "Dropped to zero", flat if "Flat", and new if it starts with "New". For "Insufficient data", "Incomplete data" or "No mentions" labels, make no claim about direction at all.
- Never say a problem is "unsolved" or "unresolved" on its own. Say "potentially unresolved" when you must.
- The executive_summary is at most 3 sentences. Each category headline is one sentence consistent with its trend_label.
- For each category give up to 4 top_pain_points and up to 3 product_opportunities for a code review automation tool, each citing one or more supplied post ids. If the evidence is thin, return fewer or empty lists.
- Return every input category exactly once, using the category name exactly as supplied.`;

/** Asks Gemini for the commentary and applies the output rules. Throws if Gemini cannot produce a valid answer. */
export async function generateCommentary(
  base: BriefContent,
  evidencePosts: Map<string, PostRow[]>,
  unresolved: UnresolvedItem[],
  deadlineMs?: number,
): Promise<CheckedBrief> {
  const input = {
    categories: base.categories.map((c) => ({
      category: c.category,
      current_count: c.current_count,
      previous_count: c.previous_count,
      trend_label: c.trend_label,
      data_status: c.data_status,
      evidence: (evidencePosts.get(c.category) ?? []).map((p) => ({
        id: postKey(p.source, p.post_id),
        source: p.source,
        title: p.title,
        pain_point: p.pain_point ?? "",
        sentiment: p.sentiment ?? "unknown",
      })),
    })),
    potentially_unresolved: unresolved.slice(0, 15).map((u) => ({ id: postKey(u.source, u.post_id), reason: u.reason })),
  };
  const allowedIds = new Set<string>();
  for (const c of input.categories) for (const e of c.evidence) allowedIds.add(e.id);
  for (const u of input.potentially_unresolved) allowedIds.add(u.id);
  const ctx = { categoryKinds: new Map(base.categories.map((c) => [c.category, c.trend_kind])), allowedIds };

  const { data } = await geminiJson({
    system: SYSTEM,
    prompt: `Data:\n${JSON.stringify(input)}`,
    responseSchema: BRIEF_SCHEMA,
    temperature: 0.3,
    deadlineMs,
    zod: BriefOutputSchema,
    check: (out) => checkBrief(out, ctx).violations,
  });
  return checkBrief(data, ctx);
}

/** Merges validated commentary into the base brief. Every link is looked up in the database rows, never taken from Gemini. */
export function applyCommentary(base: BriefContent, checked: CheckedBrief, posts: PostRow[]): BriefContent {
  const byId = new Map(posts.map((p) => [postKey(p.source, p.post_id), p]));
  const resolve = (ids: string[]): EvidenceLink[] =>
    ids.map((id) => byId.get(id)).filter((p): p is PostRow => !!p).map(link);
  const categories = base.categories.map((c) => {
    const ai = checked.categories.find((x) => x.category === c.category);
    if (!ai) return c;
    return {
      ...c,
      headline: ai.headline,
      pain_points: ai.top_pain_points.map((x) => ({ label: x.label, evidence: resolve(x.post_ids) })).filter((x) => x.evidence.length),
      opportunities: ai.product_opportunities.map((x) => ({ text: x.text, evidence: resolve(x.post_ids) })).filter((x) => x.evidence.length),
    };
  });
  return {
    ...base,
    executive_summary: checked.executive_summary,
    ai: { ...base.ai, status: "ok", model: geminiModel(), reason: null },
    categories,
  };
}

/** Text shown for the "Change" column. Percentages are only shown when previous > 0 and a trend is claimed. */
export function changeText(c: { pct_change: number | null; trend_kind?: TrendKind; trend_label?: string }): string {
  const kind = c.trend_kind ?? (c.trend_label ? labelToKind(c.trend_label) : "insufficient");
  if (kind === "new") return "New";
  if (["up", "down", "flat", "dropped"].includes(kind) && c.pct_change !== null) {
    const v = c.pct_change;
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  }
  return "n/a";
}
