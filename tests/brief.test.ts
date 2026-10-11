import { describe, expect, it } from "vitest";
import { applyCommentary, assembleBase, changeText } from "@/lib/brief";
import { bearerOk } from "@/lib/auth";
import { pickFlashModel } from "@/lib/gemini";
import { decodeEntities, snippet } from "@/lib/text";
import { computeStats } from "@/lib/stats";
import { windowsFor } from "@/lib/windows";
import type { PostRow, Topic } from "@/lib/types";

process.env.GEMINI_MODEL = "gemini-test-flash";
const anchor = new Date("2026-10-09T02:30:00Z");
const w = windowsFor(anchor);
const topics: Topic[] = [
  { id: 1, category: "CI", keyword: "flaky tests", active: true, created_at: "2026-10-01T00:00:00Z" },
  { id: 2, category: "Review", keyword: "code review", active: true, created_at: "2025-01-01T00:00:00Z" },
];
const post = (id: string, over: Partial<PostRow> = {}): PostRow => ({
  source: "hn", post_id: id, title: `Title ${id}`, snippet: null, url: `https://news.ycombinator.com/item?id=${id}`, created_at: "2026-10-05T00:00:00Z",
  comments: 3, score: 1, answer_count: null, has_accepted_answer: null, tags: null, fetched_at: "2026-10-09T00:00:00Z",
  relevant: true, sentiment: "negative", pain_point: "x", seeking_help: false, classified_at: "x", ...over,
});
const posts = [post("1"), post("2")];
const matches = [
  { source: "hn", post_id: "1", category: "CI", keyword: "flaky tests", created_at: posts[0].created_at },
  { source: "hn", post_id: "2", category: "Review", keyword: "code review", created_at: posts[1].created_at },
];
const stats = computeStats({ matches, activeTopics: topics, windows: w, settings: { min_mentions: 5, flat_threshold_pct: 10 }, outcomes: [] });
const base = () => assembleBase({ anchor, now: new Date("2026-10-11T00:00:00Z"), topics, stats: stats.rows, totals: stats.totals, posts, matches, unresolved: [], outcomes: [], currentFrom: w.current.from, classified: 2, unclassified: 0 });

describe("brief assembly", () => {
  it("marks recently added categories (topic created in the last 14 days)", () => {
    const b = base();
    expect(b.categories.find((c) => c.category === "CI")!.recently_added).toBe(true);
    expect(b.categories.find((c) => c.category === "Review")!.recently_added).toBe(false);
  });
  it("stats-only base has no AI text and carries database evidence links", () => {
    const b = base();
    expect(b.executive_summary).toBeNull();
    expect(b.ai.status).toBe("unavailable");
    expect(b.categories[0].evidence[0].url).toContain("news.ycombinator.com");
  });
  it("links come from the database rows, and ids not in the database are dropped", () => {
    const b = applyCommentary(
      base(),
      { executive_summary: "Summary.", violations: [], categories: [{ category: "CI", headline: "Headline.", top_pain_points: [{ label: "Flakes", post_ids: ["hn:1", "hn:404"] }], product_opportunities: [] }] },
      posts,
    );
    const ci = b.categories.find((c) => c.category === "CI")!;
    expect(ci.pain_points[0].evidence).toHaveLength(1);
    expect(ci.pain_points[0].evidence[0].url).toBe("https://news.ycombinator.com/item?id=1");
    expect(b.ai.status).toBe("ok");
  });
  it("shows percentages only when a trend is claimed", () => {
    expect(changeText({ pct_change: 28.6, trend_kind: "up" })).toBe("+28.6%");
    expect(changeText({ pct_change: -100, trend_kind: "dropped" })).toBe("-100.0%");
    expect(changeText({ pct_change: -100, trend_kind: "insufficient" })).toBe("n/a");
    expect(changeText({ pct_change: null, trend_kind: "new" })).toBe("New");
  });
});

describe("helpers", () => {
  it("bearer check", () => {
    expect(bearerOk("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerOk("Bearer nope", "s3cret")).toBe(false);
    expect(bearerOk(null, "s3cret")).toBe(false);
    expect(bearerOk("Bearer s3cret", undefined)).toBe(false);
  });
  it("picks the newest standard Flash model", () => {
    expect(pickFlashModel(["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-pro"])).toBe("gemini-2.5-flash");
    expect(pickFlashModel(["gemini-2.5-flash", "gemini-3-flash"])).toBe("gemini-3-flash");
    expect(pickFlashModel(["gemini-2.5-pro"])).toBeNull();
  });
  it("decodes entities and strips HTML", () => {
    expect(decodeEntities("Why &quot;CI&quot; &amp; CD isn&#39;t &lt;fast&gt;")).toBe(`Why "CI" & CD isn't <fast>`);
    expect(snippet("<p>Hello <code>x</code> world</p>")).toBe("Hello x world");
    expect(snippet("a".repeat(500))!.length).toBe(400);
  });
});
