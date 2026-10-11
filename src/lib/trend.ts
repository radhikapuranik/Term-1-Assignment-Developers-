import type { TrendKind } from "./types";

export const LABELS: Record<TrendKind, string> = {
  incomplete: "Incomplete data, no trend claimed",
  zero: "No mentions (confirmed zero)",
  insufficient: "Insufficient data, no trend claimed",
  new: "New, no mentions last week",
  dropped: "Dropped to zero",
  up: "Up",
  down: "Down",
  flat: "Flat",
};

export function labelToKind(label: string): TrendKind {
  for (const k of Object.keys(LABELS) as TrendKind[]) {
    if (LABELS[k] === label) return k;
  }
  return "insufficient";
}

/** Percent change, one decimal. Only defined when previous > 0. */
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface TrendInput {
  current: number;
  previous: number;
  incomplete: boolean;
  minMentions: number;
  flatThresholdPct: number;
}

export function trendFor(i: TrendInput): { kind: TrendKind; label: string; pct: number | null } {
  const pct = pctChange(i.current, i.previous);
  let kind: TrendKind;
  if (i.incomplete) kind = "incomplete";
  else if (i.current === 0 && i.previous === 0) kind = "zero";
  else if (i.current + i.previous < i.minMentions) kind = "insufficient";
  else if (i.previous === 0 && i.current > 0) kind = "new";
  else if (i.current === 0 && i.previous > 0) kind = "dropped";
  else if (pct !== null && Math.abs(pct) <= i.flatThresholdPct) kind = "flat";
  else kind = (pct ?? 0) > 0 ? "up" : "down";
  return { kind, label: LABELS[kind], pct };
}
