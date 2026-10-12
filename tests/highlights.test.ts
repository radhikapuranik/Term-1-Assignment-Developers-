import { describe, expect, it } from "vitest";
import { pickHighlights, pulseSpikes, ratioNote, shortName, slug } from "@/lib/highlights";
import type { BriefCategory, BriefContent } from "@/lib/brief";

const cat = (over: Partial<BriefCategory>): BriefCategory => ({
  category: "X", current_count: 10, previous_count: 5, pct_change: 100, trend_label: "Up", trend_kind: "up", data_status: "complete",
  recently_added: false, headline: null, keywords: [], evidence: [], pain_points: [], opportunities: [], ...over,
});
const brief = (categories: BriefCategory[], unresolved: BriefContent["unresolved"] = []): BriefContent => ({
  version: 1, generated_at: "", anchor: "", window_sentence: "", totals: { current: 0, previous: 0 }, executive_summary: null,
  ai: { status: "ok", model: null, reason: null, classified: 0, unclassified: 0 }, categories, unresolved, data_quality: [],
});

describe("pickHighlights", () => {
  it("chooses the biggest riser and faller by percent change, ignoring categories with no trend claim", () => {
    const h = pickHighlights(brief([
      cat({ category: "A", pct_change: 20 }),
      cat({ category: "B", pct_change: 80 }),
      cat({ category: "C", trend_kind: "down", pct_change: -10 }),
      cat({ category: "D", trend_kind: "dropped", pct_change: -100 }),
      cat({ category: "E", trend_kind: "insufficient", pct_change: 400 }),
    ]));
    expect(h.riser?.category).toBe("B");
    expect(h.faller?.category).toBe("D");
  });
  it("returns null when nothing is rising or falling, and takes the first unresolved item", () => {
    const u = { source: "so" as const, post_id: "1", title: "t", url: "u", reason: "r", created_at: "", fetched_at: "" };
    const h = pickHighlights(brief([cat({ trend_kind: "flat", pct_change: 1 })], [u]));
    expect(h.riser).toBeNull();
    expect(h.faller).toBeNull();
    expect(h.unresolved).toBe(u);
  });
});

describe("ratioNote", () => {
  it("computes the ratio from the real counts", () => {
    expect(ratioNote({ trend_kind: "up", current_count: 66, previous_count: 51 })).toBe("1.3x last week");
    expect(ratioNote({ trend_kind: "up", current_count: 30, previous_count: 10 })).toBe("3.0x last week");
  });
  it("never invents a ratio without a baseline or a rise", () => {
    expect(ratioNote({ trend_kind: "up", current_count: 5, previous_count: 0 })).toBeNull();
    expect(ratioNote({ trend_kind: "down", current_count: 5, previous_count: 10 })).toBeNull();
    expect(ratioNote({ trend_kind: "new", current_count: 5, previous_count: 0 })).toBe("new this week");
  });
});

describe("pulseSpikes", () => {
  it("makes rising categories the tallest spikes, scaled by their percent change", () => {
    const s = pulseSpikes([
      cat({ category: "Big", pct_change: 90 }),
      cat({ category: "Small", pct_change: 10 }),
      cat({ category: "Down", trend_kind: "down", pct_change: -40 }),
      cat({ category: "Quiet", trend_kind: "insufficient", pct_change: null }),
    ]);
    expect(s[0].height).toBeGreaterThan(s[1].height);
    expect(s[1].height).toBeGreaterThan(0.3);
    expect(s[2].height).toBeLessThan(0);
    expect(Math.abs(s[3].height)).toBeLessThan(0.1);
    expect(Math.max(...s.map((x) => x.height))).toBeLessThanOrEqual(1);
  });
  it("short names and slugs are stable", () => {
    expect(shortName("Code review process and culture")).toBe("Code review");
    expect(slug("CI/CD pipeline pain")).toBe("ci-cd-pipeline-pain");
  });
});
