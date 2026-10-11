import { describe, expect, it } from "vitest";
import { pctChange, trendFor, LABELS } from "@/lib/trend";

const base = { incomplete: false, minMentions: 5, flatThresholdPct: 10 };

describe("pctChange", () => {
  it("never divides by zero", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
  it("rounds to one decimal", () => {
    expect(pctChange(10, 7)).toBe(42.9);
    expect(pctChange(0, 4)).toBe(-100);
    expect(pctChange(63, 49)).toBe(28.6);
  });
});

describe("trendFor, every case in order", () => {
  it("(a) incomplete beats everything", () => {
    const t = trendFor({ ...base, current: 0, previous: 0, incomplete: true });
    expect(t.label).toBe("Incomplete data, no trend claimed");
    expect(t.kind).toBe("incomplete");
  });
  it("(b) both zero is a confirmed zero", () => {
    expect(trendFor({ ...base, current: 0, previous: 0 }).label).toBe("No mentions (confirmed zero)");
  });
  it("(c) too little data", () => {
    expect(trendFor({ ...base, current: 2, previous: 2 }).label).toBe("Insufficient data, no trend claimed");
    expect(trendFor({ ...base, current: 1, previous: 0 }).label).toBe("Insufficient data, no trend claimed");
    expect(trendFor({ ...base, current: 0, previous: 4 }).label).toBe("Insufficient data, no trend claimed");
  });
  it("(c) threshold is current + previous >= min_mentions to claim a trend", () => {
    expect(trendFor({ ...base, current: 3, previous: 2 }).kind).not.toBe("insufficient");
  });
  it("(d) new when previous is 0", () => {
    const t = trendFor({ ...base, current: 6, previous: 0 });
    expect(t.label).toBe("New, no mentions last week");
    expect(t.pct).toBeNull();
  });
  it("(e) dropped to zero", () => {
    const t = trendFor({ ...base, current: 0, previous: 7 });
    expect(t.label).toBe("Dropped to zero");
    expect(t.pct).toBe(-100);
  });
  it("(f) up, down and flat with the threshold", () => {
    expect(trendFor({ ...base, current: 12, previous: 6 }).label).toBe("Up");
    expect(trendFor({ ...base, current: 6, previous: 12 }).label).toBe("Down");
    expect(trendFor({ ...base, current: 11, previous: 10 }).label).toBe("Flat"); // +10.0% is within the threshold
    expect(trendFor({ ...base, current: 12, previous: 10 }).label).toBe("Up");
    expect(trendFor({ ...base, current: 9, previous: 10 }).label).toBe("Flat"); // -10.0%
  });
  it("uses the labels from the spec", () => {
    expect(Object.values(LABELS)).toHaveLength(8);
  });
});
