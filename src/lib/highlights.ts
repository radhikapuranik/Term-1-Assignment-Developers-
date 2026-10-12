import type { BriefCategory, BriefContent } from "./brief";
import type { UnresolvedItem } from "./unresolved";
import type { TrendKind } from "./types";

export interface Highlights {
  riser: BriefCategory | null;
  faller: BriefCategory | null;
  unresolved: UnresolvedItem | null;
}

/** "This week in 10 seconds": picked by code from the stored statistics, never by the AI. */
export function pickHighlights(c: BriefContent): Highlights {
  const withPct = (cats: BriefCategory[]) => cats.filter((x) => x.pct_change !== null);
  const riser = withPct(c.categories.filter((x) => x.trend_kind === "up")).sort((a, b) => b.pct_change! - a.pct_change!)[0] ?? null;
  const faller =
    withPct(c.categories.filter((x) => x.trend_kind === "down" || x.trend_kind === "dropped")).sort((a, b) => a.pct_change! - b.pct_change!)[0] ?? null;
  return { riser, faller, unresolved: c.unresolved[0] ?? null };
}

/** Arrow annotation such as "1.3x last week". Only for a rising category with a real baseline. */
export function ratioNote(cat: Pick<BriefCategory, "trend_kind" | "current_count" | "previous_count">): string | null {
  if (cat.trend_kind === "new") return "new this week";
  if (cat.trend_kind !== "up" || cat.previous_count <= 0) return null;
  return `${(cat.current_count / cat.previous_count).toFixed(1)}x last week`;
}

export interface Spike {
  category: string;
  label: string;
  kind: TrendKind;
  count: number;
  /** -1..1: tall positive spike for a rising category, a shallow dip for falling, a tiny bump otherwise. */
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function pulseSpikes(categories: Array<Pick<BriefCategory, "category" | "trend_kind" | "pct_change" | "current_count">>): Spike[] {
  return categories.map((c) => {
    let height: number;
    switch (c.trend_kind) {
      case "up": height = 0.3 + 0.7 * clamp((c.pct_change ?? 0) / 100, 0, 1); break;
      case "new": height = 0.5; break;
      case "down":
      case "dropped": height = -0.25; break;
      case "flat": height = 0.1; break;
      default: height = 0.04; // incomplete, insufficient, zero: no claim, so almost flat
    }
    return { category: c.category, label: shortName(c.category), kind: c.trend_kind, count: c.current_count, height };
  });
}

export function shortName(category: string): string {
  const words = category.split(/\s+/);
  return words.length <= 2 ? category : `${words[0]} ${words[1]}`.replace(/[,]$/, "");
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
