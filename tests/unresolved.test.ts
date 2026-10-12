import { describe, expect, it } from "vitest";
import { unresolvedReason, findUnresolved, REASON_HN, REASON_SO_NONE } from "@/lib/unresolved";
import type { PostRow } from "@/lib/types";

const base: PostRow = {
  source: "hn", post_id: "1", title: "t", snippet: null, url: "u", created_at: "2026-10-05T00:00:00Z", comments: 0, score: 0,
  answer_count: null, has_accepted_answer: null, tags: null, fetched_at: "2026-10-09T00:00:00Z",
  relevant: true, sentiment: "negative", pain_point: null, seeking_help: false, classified_at: "x",
};

describe("potentially unresolved", () => {
  it("Stack Overflow: no answers", () => {
    expect(unresolvedReason({ ...base, source: "so", answer_count: 0, has_accepted_answer: false })).toBe(REASON_SO_NONE);
    expect(unresolvedReason({ ...base, source: "so", answer_count: 2, has_accepted_answer: true })).toBeNull();
  });
  it("Hacker News: few replies AND a question or complaint", () => {
    expect(unresolvedReason({ ...base, comments: 1 })).toBe(REASON_HN);
    expect(unresolvedReason({ ...base, comments: 5 })).toBeNull();
    expect(unresolvedReason({ ...base, comments: 0, sentiment: "neutral", seeking_help: false })).toBeNull();
    expect(unresolvedReason({ ...base, comments: 0, sentiment: "neutral", seeking_help: true })).toBe(REASON_HN);
  });
  it("Dev.to: only help or discuss posts with zero comments", () => {
    expect(unresolvedReason({ ...base, source: "devto", tags: ["discuss"], comments: 0 })).toBeTruthy();
    expect(unresolvedReason({ ...base, source: "devto", tags: ["help"], comments: 1 })).toBeNull();
    expect(unresolvedReason({ ...base, source: "devto", tags: ["tutorial"], comments: 0, seeking_help: true })).toBeNull();
  });
  it("Gemini's seeking_help alone never adds a candidate", () => {
    expect(unresolvedReason({ ...base, source: "so", answer_count: 3, has_accepted_answer: true, seeking_help: true })).toBeNull();
  });
  it("irrelevant posts are excluded, SO no-answer items sort first", () => {
    const items = findUnresolved([
      { ...base, post_id: "a", comments: 0 },
      { ...base, post_id: "b", source: "so", answer_count: 0, has_accepted_answer: false },
      { ...base, post_id: "c", comments: 0, relevant: false },
    ]);
    expect(items.map((i) => i.post_id)).toEqual(["b", "a"]);
  });
});

describe("unresolved: exclusions and signals", () => {
  const hn = (over: Partial<PostRow>) => ({ ...base, comments: 0, ...over });
  it("excludes Show HN and launch posts", () => {
    expect(unresolvedReason(hn({ title: "Show HN: Lask, a task runner" }))).toBeNull();
    expect(unresolvedReason(hn({ title: "Launch HN: Acme (YC S26) - code review bot" }))).toBeNull();
  });
  it("excludes blog and announcement posts", () => {
    expect(unresolvedReason(hn({ title: "Introducing our new CI dashboard" }))).toBeNull();
    expect(unresolvedReason(hn({ title: "How we cut CI time in half" }))).toBeNull();
    expect(unresolvedReason({ ...base, source: "devto", tags: ["discuss", "tutorial"], comments: 0 })).toBeNull();
  });
  it("requires a question or complaint signal for Hacker News and Dev.to", () => {
    expect(unresolvedReason(hn({ title: "A note on pipelines", sentiment: "neutral", seeking_help: false }))).toBeNull();
    expect(unresolvedReason(hn({ title: "Why is our CI so slow?", sentiment: "neutral", seeking_help: false }))).toBe(REASON_HN);
    expect(unresolvedReason({ ...base, source: "devto", title: "Thoughts on reviews", tags: ["discuss"], comments: 0, sentiment: "neutral", seeking_help: false })).toBeNull();
  });
});
