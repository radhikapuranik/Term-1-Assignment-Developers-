import { describe, expect, it } from "vitest";
import { applyLiveTopics, type BackfillRow } from "@/lib/overlay";
import { cleanLabel, AdminError } from "@/lib/topics-admin";
import type { BriefCategory, BriefContent } from "@/lib/brief";

const cat = (over: Partial<BriefCategory>): BriefCategory => ({
  category_id: 10, category: "CI", current_count: 6, previous_count: 5, pct_change: 20, trend_label: "Up", trend_kind: "up", data_status: "complete",
  recently_added: false, headline: null, keywords: [{ topic_id: 1, keyword: "flaky tests", current_count: 6, previous_count: 5, pct_change: 20, trend_label: "Up", data_status: "complete" }],
  evidence: [], pain_points: [], opportunities: [], ...over,
});
const brief = (cats: BriefCategory[]): BriefContent => ({
  version: 1, generated_at: "", anchor: "", window_sentence: "", totals: { current: 0, previous: 0 }, executive_summary: null,
  ai: { status: "ok", model: null, reason: null, classified: 0, unclassified: 0 }, categories: cats, unresolved: [], data_quality: [],
});
const cats = [{ id: 10, name: "CI renamed", active: true }, { id: 20, name: "New cat", active: true }];
const old = "2026-01-01T00:00:00Z";
const topics = [
  { id: 1, category_id: 10, keyword: "flaky tests v2", active: true, created_at: old },
  { id: 2, category_id: 10, keyword: "merge queue", active: true, created_at: new Date().toISOString() },
  { id: 3, category_id: 20, keyword: "brand new", active: true, created_at: new Date().toISOString() },
];
const row = (over: Partial<BackfillRow>): BackfillRow => ({ level: "keyword", category_id: 10, topic_id: 2, current_count: 7, previous_count: 3, pct_change: 133.3, trend_label: "Up", data_status: "complete", ...over });

describe("applyLiveTopics", () => {
  it("shows renames at once and never touches a stored number", () => {
    const out = applyLiveTopics(brief([cat({})]), cats, topics, []);
    expect(out.categories[0].category).toBe("CI renamed");
    expect(out.categories[0].keywords[0].keyword).toBe("flaky tests v2");
    expect([out.categories[0].current_count, out.categories[0].previous_count]).toEqual([6, 5]);
    expect(out.categories[0].backfilled).toBeUndefined();
  });
  it("adds a backfilled keyword to an existing category and replaces that category's row, flagged as backfilled", () => {
    const out = applyLiveTopics(brief([cat({})]), cats, topics, [row({}), row({ level: "category", topic_id: 0, current_count: 13, previous_count: 8, pct_change: 62.5 })]);
    const c = out.categories.find((x) => x.category_id === 10)!;
    expect(c.keywords.find((k) => k.topic_id === 2)).toMatchObject({ current_count: 7, previous_count: 3, backfilled: true });
    expect(c).toMatchObject({ current_count: 13, previous_count: 8, backfilled: true });
    expect(c.keywords.find((k) => k.topic_id === 1)!.backfilled).toBeUndefined();
  });
  it("creates a new category from its backfill, and a newer backfill replaces an older one", () => {
    const out = applyLiveTopics(brief([cat({})]), cats, topics, [
      row({ category_id: 20, topic_id: 3, current_count: 1 }), row({ level: "category", category_id: 20, topic_id: 0, current_count: 1 }),
      row({ category_id: 20, topic_id: 3, current_count: 4 }), row({ level: "category", category_id: 20, topic_id: 0, current_count: 4 }),
    ]);
    const n = out.categories.find((x) => x.category_id === 20)!;
    expect(n.category).toBe("New cat");
    expect(n.current_count).toBe(4);
    expect(n.keywords[0]).toMatchObject({ topic_id: 3, current_count: 4, backfilled: true });
  });
  it("a source that failed shows as no baseline, with no invented trend", () => {
    const out = applyLiveTopics(brief([cat({})]), cats, topics, [row({ data_status: "incomplete", pct_change: null, trend_label: "Incomplete data, no trend claimed" })]);
    const k = out.categories[0].keywords.find((x) => x.topic_id === 2)!;
    expect([k.data_status, k.pct_change, k.backfilled]).toEqual(["incomplete", null, true]);
  });
  it("switched-off topics are not shown from a backfill", () => {
    const off = topics.map((t) => (t.id === 2 ? { ...t, active: false } : t));
    const out = applyLiveTopics(brief([cat({})]), cats, off, [row({})]);
    expect(out.categories[0].keywords.some((k) => k.topic_id === 2)).toBe(false);
  });
});

describe("cleanLabel", () => {
  it("trims, collapses spaces and enforces 2 to 80 characters", () => {
    expect(cleanLabel("  merge   queue ", "keyword")).toBe("merge queue");
    expect(() => cleanLabel("a", "keyword")).toThrow(AdminError);
    expect(() => cleanLabel("x".repeat(81), "keyword")).toThrow(AdminError);
    expect(() => cleanLabel(undefined, "keyword")).toThrow(AdminError);
  });
});
