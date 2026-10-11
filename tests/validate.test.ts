import { describe, expect, it } from "vitest";
import { checkBrief, textProblem, allowedDirections, type BriefOutput } from "@/lib/validate";
import type { TrendKind } from "@/lib/types";

const ctx = (kind: TrendKind = "up") => ({
  categoryKinds: new Map<string, TrendKind>([["Code review", kind]]),
  allowedIds: new Set(["hn:1", "so:2"]),
});
const out = (over: Partial<BriefOutput["categories"][number]> = {}, summary = "Teams discuss review pain."): BriefOutput => ({
  executive_summary: summary,
  categories: [{ category: "Code review", headline: "Review conversations are rising.", top_pain_points: [{ label: "Slow reviews", post_ids: ["hn:1"] }], product_opportunities: [], ...over }],
});

describe("textProblem", () => {
  const none = new Set<never>();
  it("rejects standalone numbers, percentages and URLs", () => {
    expect(textProblem("There were 14 posts", none)).toMatch(/number/);
    expect(textProblem("Up 20% on last week", none)).toBeTruthy();
    expect(textProblem("grew by ten percent", none)).toMatch(/percentage/);
    expect(textProblem("See https://news.ycombinator.com/item?id=1", none)).toBeTruthy();
    expect(textProblem("see example.com for more", none)).toMatch(/URL/);
  });
  it("accepts ordinary text, including CI/CD and identifiers with digits inside words", () => {
    expect(textProblem("CI/CD pipelines break on S3 uploads", none)).toBeNull();
  });
  it('requires "potentially" before unresolved and forbids unsolved', () => {
    expect(textProblem("This is unsolved", none)).toBeTruthy();
    expect(textProblem("This is unresolved", none)).toBeTruthy();
    expect(textProblem("This is potentially unresolved", none)).toBeNull();
  });
  it("direction words must match the trend label", () => {
    expect(textProblem("Interest is rising", allowedDirections("up"))).toBeNull();
    expect(textProblem("Interest is rising", allowedDirections("down"))).toBeTruthy();
    expect(textProblem("Interest is falling", allowedDirections("down"))).toBeNull();
    expect(textProblem("Interest is falling", allowedDirections("dropped"))).toBeNull();
    expect(textProblem("Interest is falling", allowedDirections("insufficient"))).toBeTruthy();
    expect(textProblem("Interest is rising", allowedDirections("incomplete"))).toBeTruthy();
    expect(textProblem("A newly emerging topic", allowedDirections("new"))).toBeNull();
  });
});

describe("checkBrief", () => {
  it("passes a clean answer through", () => {
    const r = checkBrief(out(), ctx("up"));
    expect(r.violations).toEqual([]);
    expect(r.categories[0].top_pain_points[0].post_ids).toEqual(["hn:1"]);
  });
  it("drops unknown post ids, and items left with no evidence", () => {
    const r = checkBrief(out({ top_pain_points: [{ label: "A", post_ids: ["hn:999"] }, { label: "B", post_ids: ["hn:999", "so:2"] }] }), ctx("up"));
    expect(r.categories[0].top_pain_points).toEqual([{ label: "B", post_ids: ["so:2"] }]);
  });
  it("drops unknown categories", () => {
    const o = out();
    o.categories.push({ category: "Invented", headline: "x", top_pain_points: [], product_opportunities: [] });
    expect(checkBrief(o, ctx()).categories.map((c) => c.category)).toEqual(["Code review"]);
  });
  it("a category with a numeric headline loses its AI commentary and reports a violation", () => {
    const r = checkBrief(out({ headline: "There were 14 posts" }), ctx("up"));
    expect(r.violations.length).toBe(1);
    expect(r.categories[0].headline).toBeNull();
    expect(r.categories[0].top_pain_points).toEqual([]);
  });
  it("a direction word that contradicts the trend label is a violation", () => {
    const r = checkBrief(out(), ctx("down"));
    expect(r.violations.length).toBe(1);
  });
  it("a bad executive summary is dropped on its own", () => {
    const r = checkBrief(out({}, "Over 30% more discussion"), ctx("up"));
    expect(r.executive_summary).toBeNull();
    expect(r.categories[0].headline).not.toBeNull();
  });
});
