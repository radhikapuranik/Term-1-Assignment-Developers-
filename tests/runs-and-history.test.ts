import { describe, expect, it } from "vitest";
import { runNote } from "@/lib/run-note";
import { buildHistory, isThin } from "@/lib/highlights";
import { summarizeSources } from "@/lib/health";

describe("runNote", () => {
  const fail = (target: string) => ({ source: "hn" as const, target, ok: false, count: 0, retries: 3, error: "HTTP 503" });
  const ok = [{ source: "devto" as const, target: "t", ok: true, count: 2, retries: 0 }, { source: "so" as const, target: "k", ok: true, count: 1, retries: 0 }];
  it("says nothing for runs that went fine", () => {
    expect(runNote({ status: "sent", error: null, source_status: null })).toBeNull();
  });
  it("explains a source that did not respond, in plain words", () => {
    const ss = summarizeSources([fail("a"), fail("b"), ...ok]);
    expect(runNote({ status: "partial", error: "[fetch/hn] a: HTTP 503", source_status: ss })).toBe("Hacker News did not respond.");
  });
  it("explains AI and email problems, and combines reasons", () => {
    const ss = summarizeSources([fail("a"), { ...fail("b"), ok: true, error: undefined, count: 1 }, ...ok]);
    const n = runNote({ status: "partial", error: "[brief/gemini] timed out | [email/resend] 429", source_status: ss });
    expect(n).toBe("Hacker News partly failed (1 of 2 requests); the AI summary was unavailable; the email could not be delivered.");
  });
  it("has a fallback and explains a stopped run", () => {
    expect(runNote({ status: "partial", error: null, source_status: null })).toBe("Some data or steps were unavailable.");
    expect(runNote({ status: "failed", error: "[pipeline/code] No active topics in the topics table.", source_status: null })).toBe("The run stopped: No active topics in the topics table.");
  });
});

describe("trend history reads the same numbers as the table", () => {
  const cat = { previous_count: 1, current_count: 0, data_status: "complete" as const };
  it("ends with last week and this week exactly as the table shows them", () => {
    const h = buildHistory(cat, []);
    expect(h.map((p) => p.value)).toEqual([1, 0]);
    expect(h.map((p) => p.label)).toEqual(["last week", "this week"]);
  });
  it("puts earlier scheduled weeks first and keeps their data status", () => {
    const h = buildHistory(cat, [{ label: "Fri 2 Oct", current_count: 4, data_status: "incomplete" }]);
    expect(h.map((p) => p.value)).toEqual([4, 1, 0]);
    expect(h[0].incomplete).toBe(true);
  });
});

describe("thin evidence", () => {
  it("labels categories backed by only 1 or 2 posts", () => {
    expect([0, 1, 2, 3].map((n) => isThin({ current_count: n }))).toEqual([false, true, true, false]);
  });
});
