import { describe, expect, it } from "vitest";
import { computeStats, incompleteKeywords, verifyMatches, type MatchRow } from "@/lib/stats";
import { windowsFor } from "@/lib/windows";
import type { RawPost, RequestOutcome } from "@/lib/types";

const anchor = new Date("2026-10-09T02:30:00Z");
const w = windowsFor(anchor);
const cur = "2026-10-05T10:00:00Z";
const prev = "2026-09-28T10:00:00Z";
const settings = { min_mentions: 1, flat_threshold_pct: 10 };
// keyword ids 1, 2, 3; category ids 10 (A) and 20 (B). "alpha" exists in both categories as two different keywords.
const topics = [
  { id: 1, category_id: 10, category: "A", keyword: "alpha" },
  { id: 2, category_id: 10, category: "A", keyword: "beta" },
  { id: 3, category_id: 20, category: "B", keyword: "alpha" },
];
const m = (post_id: string, topic_id: number, created_at = cur, source = "hn"): MatchRow => ({ source, post_id, topic_id, created_at });
const ok: RequestOutcome[] = [];
const cat = (r: ReturnType<typeof computeStats>, id: number) => r.rows.find((x) => x.level === "category" && x.category_id === id)!;
const kw = (r: ReturnType<typeof computeStats>, id: number) => r.rows.find((x) => x.level === "keyword" && x.topic_id === id)!;

describe("deduplication", () => {
  it("a post matching two keywords in one category counts once for that category", () => {
    const r = computeStats({ matches: [m("1", 1), m("1", 2)], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(cat(r, 10).current_count).toBe(1);
    expect(kw(r, 1).current_count).toBe(1);
    expect(kw(r, 2).current_count).toBe(1);
  });
  it("a post matching two categories counts once in each, and once overall", () => {
    const r = computeStats({ matches: [m("1", 1), m("1", 3)], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(cat(r, 10).current_count).toBe(1);
    expect(cat(r, 20).current_count).toBe(1);
    expect(r.totals.current).toBe(1);
  });
  it("the same id from different sources are different posts", () => {
    const r = computeStats({ matches: [m("1", 1, cur, "hn"), m("1", 1, cur, "so")], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(r.totals.current).toBe(2);
  });
});

describe("windows and activity", () => {
  it("splits by created_at and ignores posts outside both windows", () => {
    const r = computeStats({
      matches: [m("1", 1, cur), m("2", 1, prev), m("3", 1, "2026-09-01T00:00:00Z"), m("4", 1, "2026-10-09T02:30:00Z")],
      activeTopics: topics, windows: w, settings, outcomes: ok,
    });
    expect([cat(r, 10).current_count, cat(r, 10).previous_count]).toEqual([1, 1]);
  });
  it("switching a keyword off hides it from the counts but nothing else changes", () => {
    const matches = [m("1", 1), m("2", 2)];
    const on = computeStats({ matches, activeTopics: topics, windows: w, settings, outcomes: ok });
    const off = computeStats({ matches, activeTopics: topics.filter((t) => t.id !== 2), windows: w, settings, outcomes: ok });
    expect(cat(on, 10).current_count).toBe(2);
    expect(cat(off, 10).current_count).toBe(1);
    expect(off.rows.some((x) => x.topic_id === 2)).toBe(false);
    // switching it back on restores the same numbers: the matches were never deleted, nothing is invented
    const back = computeStats({ matches, activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(back.rows).toEqual(on.rows);
  });
});

describe("permanent ids", () => {
  it("renaming a keyword or a category only changes labels, never the counts", () => {
    const matches = [m("1", 1), m("2", 1, prev), m("3", 2)];
    const before = computeStats({ matches, activeTopics: topics, windows: w, settings, outcomes: ok });
    const renamed = topics.map((t) => ({ ...t, category: t.category_id === 10 ? "A renamed" : t.category, keyword: t.id === 1 ? "alpha v2" : t.keyword }));
    const after = computeStats({ matches, activeTopics: renamed, windows: w, settings, outcomes: ok });
    expect(after.rows.map((r) => [r.category_id, r.topic_id, r.current_count, r.previous_count])).toEqual(before.rows.map((r) => [r.category_id, r.topic_id, r.current_count, r.previous_count]));
    expect(after.rows.find((r) => r.topic_id === 1)!.keyword).toBe("alpha v2");
    expect(after.rows.find((r) => r.level === "category" && r.category_id === 10)!.category).toBe("A renamed");
  });
  it("moving a keyword to another category moves its posts with it", () => {
    const matches = [m("1", 2)];
    const moved = topics.map((t) => (t.id === 2 ? { ...t, category_id: 20, category: "B" } : t));
    const r = computeStats({ matches, activeTopics: moved, windows: w, settings, outcomes: ok });
    expect(cat(r, 10).current_count).toBe(0);
    expect(cat(r, 20).current_count).toBe(1);
  });
});

describe("incomplete data", () => {
  it("a failed request for a keyword makes its category incomplete, with no trend claimed", () => {
    const outcomes: RequestOutcome[] = [{ source: "hn", target: "beta", ok: false, count: 0, retries: 3, error: "HTTP 503" }];
    const r = computeStats({ matches: [m("1", 1)], activeTopics: topics, windows: w, settings, outcomes });
    expect(cat(r, 10).data_status).toBe("incomplete");
    expect(cat(r, 10).trend_label).toBe("Incomplete data, no trend claimed");
    expect(cat(r, 20).data_status).toBe("complete");
  });
  it("a failed Dev.to tag makes everything incomplete; a genuine zero is not a failure", () => {
    const fail: RequestOutcome[] = [{ source: "devto", target: "devops", ok: false, count: 0, retries: 3 }];
    expect(incompleteKeywords(fail, ["alpha", "beta"]).size).toBe(2);
    const zero: RequestOutcome[] = [{ source: "hn", target: "alpha", ok: true, count: 0, retries: 0 }];
    expect(incompleteKeywords(zero, ["alpha"]).size).toBe(0);
    const r = computeStats({ matches: [], activeTopics: topics, windows: w, settings, outcomes: zero });
    expect(r.rows[0].trend_label).toBe("No mentions (confirmed zero)");
  });
});

describe("verifyMatches", () => {
  const post = (title: string, snippet: string | null = null): RawPost => ({
    source: "so", post_id: "9", title, snippet, url: "u", created_at: cur, comments: null, score: 0, answer_count: 0, has_accepted_answer: false, tags: null,
  });
  it("keeps only keywords that really appear in the title or snippet, as keyword ids", () => {
    expect(verifyMatches([post("Alpha is broken", "nothing here")], topics).map((x) => x.topic_id).sort()).toEqual([1, 3]);
  });
  it("finds a keyword in the snippet only, and rejects fuzzy results", () => {
    expect(verifyMatches([post("Help", "we get a beta problem")], topics)).toHaveLength(1);
    expect(verifyMatches([post("Alphabet soup")], topics)).toHaveLength(0);
  });
});
