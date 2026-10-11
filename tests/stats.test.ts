import { describe, expect, it } from "vitest";
import { computeStats, incompleteKeywords, verifyMatches, type MatchRow } from "@/lib/stats";
import { windowsFor } from "@/lib/windows";
import type { RawPost, RequestOutcome } from "@/lib/types";

const anchor = new Date("2026-10-09T02:30:00Z");
const w = windowsFor(anchor);
const cur = "2026-10-05T10:00:00Z";
const prev = "2026-09-28T10:00:00Z";
const settings = { min_mentions: 1, flat_threshold_pct: 10 };
const topics = [
  { category: "A", keyword: "alpha" },
  { category: "A", keyword: "beta" },
  { category: "B", keyword: "alpha" },
];
const m = (post_id: string, category: string, keyword: string, created_at = cur, source = "hn"): MatchRow => ({ source, post_id, category, keyword, created_at });
const ok: RequestOutcome[] = [];

describe("deduplication", () => {
  it("a post matching two keywords in one category counts once for that category", () => {
    const r = computeStats({ matches: [m("1", "A", "alpha"), m("1", "A", "beta")], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(r.rows.find((x) => x.level === "category" && x.category === "A")!.current_count).toBe(1);
    expect(r.rows.find((x) => x.level === "keyword" && x.keyword === "alpha" && x.category === "A")!.current_count).toBe(1);
    expect(r.rows.find((x) => x.level === "keyword" && x.keyword === "beta")!.current_count).toBe(1);
  });
  it("a post matching two categories counts once in each, and once overall", () => {
    const r = computeStats({ matches: [m("1", "A", "alpha"), m("1", "B", "alpha")], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(r.rows.find((x) => x.level === "category" && x.category === "A")!.current_count).toBe(1);
    expect(r.rows.find((x) => x.level === "category" && x.category === "B")!.current_count).toBe(1);
    expect(r.totals.current).toBe(1);
  });
  it("the same id from different sources are different posts", () => {
    const r = computeStats({ matches: [m("1", "A", "alpha", cur, "hn"), m("1", "A", "alpha", cur, "so")], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(r.totals.current).toBe(2);
  });
});

describe("windows and activity", () => {
  it("splits by created_at and ignores posts outside both windows", () => {
    const r = computeStats({
      matches: [m("1", "A", "alpha", cur), m("2", "A", "alpha", prev), m("3", "A", "alpha", "2026-09-01T00:00:00Z"), m("4", "A", "alpha", "2026-10-09T02:30:00Z")],
      activeTopics: topics, windows: w, settings, outcomes: ok,
    });
    const a = r.rows.find((x) => x.level === "category" && x.category === "A")!;
    expect([a.current_count, a.previous_count]).toEqual([1, 1]);
  });
  it("ignores matches for keywords that are no longer active", () => {
    const r = computeStats({ matches: [m("1", "A", "gamma")], activeTopics: topics, windows: w, settings, outcomes: ok });
    expect(r.totals.current).toBe(0);
  });
});

describe("incomplete data", () => {
  it("a failed request for a keyword makes its category incomplete, with no trend claimed", () => {
    const outcomes: RequestOutcome[] = [{ source: "hn", target: "beta", ok: false, count: 0, retries: 3, error: "HTTP 503" }];
    const r = computeStats({ matches: [m("1", "A", "alpha")], activeTopics: topics, windows: w, settings, outcomes });
    const a = r.rows.find((x) => x.level === "category" && x.category === "A")!;
    expect(a.data_status).toBe("incomplete");
    expect(a.trend_label).toBe("Incomplete data, no trend claimed");
    const b = r.rows.find((x) => x.level === "category" && x.category === "B")!;
    expect(b.data_status).toBe("complete");
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
  it("keeps only keywords that really appear in the title or snippet", () => {
    const r = verifyMatches([post("Alpha is broken", "nothing here")], topics);
    expect(r.map((x) => `${x.category}/${x.keyword}`).sort()).toEqual(["A/alpha", "B/alpha"]);
  });
  it("finds a keyword in the snippet only", () => {
    expect(verifyMatches([post("Help", "we get a beta problem")], topics)).toHaveLength(1);
  });
  it("rejects fuzzy results", () => {
    expect(verifyMatches([post("Alphabet soup")], topics)).toHaveLength(0);
  });
});
