import { z } from "zod";
import type { TrendKind } from "./types";

export const BriefOutputSchema = z.object({
  executive_summary: z.string().max(900),
  categories: z.array(
    z.object({
      category: z.string(),
      headline: z.string().max(400),
      top_pain_points: z.array(z.object({ label: z.string().max(200), post_ids: z.array(z.string()) })).max(8),
      product_opportunities: z.array(z.object({ text: z.string().max(400), post_ids: z.array(z.string()) })).max(8),
    }),
  ),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

type Direction = "up" | "down" | "flat" | "new";

const DIRECTION_WORDS: Record<Direction, RegExp> = {
  up: /\b(rising|surging|spiking|increasing|climbing|soaring)\b/i,
  down: /\b(falling|declining|decreasing|dwindling|waning|shrinking)\b/i,
  flat: /\b(flat|stable|steady|unchanged)\b/i,
  new: /\b(newly|emerging|emerged|first appeared)\b/i,
};

/** Which direction words are allowed for a given supplied trend kind. */
export function allowedDirections(kind: TrendKind): Set<Direction> {
  switch (kind) {
    case "up": return new Set(["up"]);
    case "down":
    case "dropped": return new Set(["down"]);
    case "flat": return new Set(["flat"]);
    case "new": return new Set(["new"]);
    default: return new Set(); // incomplete, zero, insufficient: no direction claims at all
  }
}

const NUMBER_RE = /\b\d+(?:[.,]\d+)*\b/;
const PERCENT_RE = /%|\bpercent(?:age)?\b/i;
const URL_RE = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|io|dev|app|ai|co|so|ly)\b/i;
const UNSOLVED_RE = /\bunsolved\b|(?<!potentially )\bunresolved\b/i;

/** Returns a reason when free text breaks the rules, otherwise null. */
export function textProblem(text: string, allowed: Set<Direction>): string | null {
  if (NUMBER_RE.test(text)) return "contains a number";
  if (PERCENT_RE.test(text)) return "contains a percentage";
  if (URL_RE.test(text)) return "contains a URL";
  if (UNSOLVED_RE.test(text)) return 'says "unsolved" or "unresolved" without "potentially"';
  for (const d of Object.keys(DIRECTION_WORDS) as Direction[]) {
    if (!allowed.has(d) && DIRECTION_WORDS[d].test(text)) return `uses a "${d}" direction word that does not match the supplied trend label`;
  }
  return null;
}

export interface CheckContext {
  categoryKinds: Map<string, TrendKind>;
  allowedIds: Set<string>;
}

export interface CheckedBrief {
  executive_summary: string | null;
  categories: Array<{
    category: string;
    headline: string | null;
    top_pain_points: Array<{ label: string; post_ids: string[] }>;
    product_opportunities: Array<{ text: string; post_ids: string[] }>;
  }>;
  violations: string[]; // free-text problems found (these trigger a retry)
}

/**
 * Applies the output rules. Unknown categories and unknown post ids are dropped. Free text that
 * breaks a rule is dropped too (a category with any bad text loses all of its AI commentary),
 * and every drop is reported in `violations` so the caller can retry first.
 */
export function checkBrief(output: BriefOutput, ctx: CheckContext): CheckedBrief {
  const violations: string[] = [];
  const allDirections = new Set<Direction>();
  for (const k of ctx.categoryKinds.values()) allowedDirections(k).forEach((d) => allDirections.add(d));

  let summary: string | null = output.executive_summary.trim() || null;
  if (summary) {
    const p = textProblem(summary, allDirections);
    if (p) {
      violations.push(`executive_summary ${p}`);
      summary = null;
    }
  }

  const seen = new Set<string>();
  const categories: CheckedBrief["categories"] = [];
  for (const c of output.categories) {
    const kind = ctx.categoryKinds.get(c.category);
    if (!kind || seen.has(c.category)) continue;
    seen.add(c.category);
    const allowed = allowedDirections(kind);
    const ids = (list: string[]) => [...new Set(list.filter((id) => ctx.allowedIds.has(id)))];
    const problems: string[] = [];
    const texts = [c.headline, ...c.top_pain_points.map((x) => x.label), ...c.product_opportunities.map((x) => x.text)];
    for (const t of texts) {
      const p = textProblem(t, allowed);
      if (p) problems.push(`${c.category}: "${t.slice(0, 60)}" ${p}`);
    }
    if (problems.length) {
      violations.push(...problems);
      categories.push({ category: c.category, headline: null, top_pain_points: [], product_opportunities: [] });
      continue;
    }
    categories.push({
      category: c.category,
      headline: c.headline.trim() || null,
      top_pain_points: c.top_pain_points
        .map((x) => ({ label: x.label.trim(), post_ids: ids(x.post_ids) }))
        .filter((x) => x.label && x.post_ids.length > 0),
      product_opportunities: c.product_opportunities
        .map((x) => ({ text: x.text.trim(), post_ids: ids(x.post_ids) }))
        .filter((x) => x.text && x.post_ids.length > 0),
    });
  }
  return { executive_summary: summary, categories, violations };
}

export const ClassifyOutputSchema = z.array(
  z.object({
    id: z.string(),
    relevant: z.boolean(),
    sentiment: z.enum(["negative", "neutral", "positive"]),
    pain_point: z.string(),
    seeking_help: z.boolean(),
  }),
);
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;
