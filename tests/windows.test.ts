import { describe, expect, it } from "vitest";
import { scheduledAnchor, windowsFor, windowOf, WEEK_MS } from "@/lib/windows";

describe("windows", () => {
  it("scheduled anchor is the most recent Friday 02:30 UTC at or before now", () => {
    // Sunday 11 Oct 2026 -> Friday 9 Oct 2026 02:30 UTC
    expect(scheduledAnchor(new Date("2026-10-11T17:00:00Z")).toISOString()).toBe("2026-10-09T02:30:00.000Z");
    // Friday before 02:30 UTC -> the previous Friday
    expect(scheduledAnchor(new Date("2026-10-09T02:29:59Z")).toISOString()).toBe("2026-10-02T02:30:00.000Z");
    // Friday exactly at 02:30 -> that moment
    expect(scheduledAnchor(new Date("2026-10-09T02:30:00Z")).toISOString()).toBe("2026-10-09T02:30:00.000Z");
  });

  it("gives the same anchor to the primary run, retries and the catch-up run on the same Friday", () => {
    const times = ["2026-10-09T02:30:05Z", "2026-10-09T02:45:00Z", "2026-10-09T03:30:00Z", "2026-10-09T23:59:00Z", "2026-10-10T10:00:00Z"];
    const anchors = new Set(times.map((t) => scheduledAnchor(new Date(t)).toISOString()));
    expect(anchors.size).toBe(1);
  });

  it("is 08:00 IST", () => {
    const a = scheduledAnchor(new Date("2026-10-11T00:00:00Z"));
    const ist = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(a);
    expect(ist).toBe("08:00");
  });

  it("windows are half-open, adjacent, and never overlap", () => {
    const a = new Date("2026-10-09T02:30:00Z");
    const w = windowsFor(a);
    expect(w.current.to.getTime()).toBe(a.getTime());
    expect(w.current.from.getTime()).toBe(a.getTime() - WEEK_MS);
    expect(w.previous.to.getTime()).toBe(w.current.from.getTime());
    expect(w.previous.from.getTime()).toBe(a.getTime() - 2 * WEEK_MS);
    expect(w.fetchFrom.getTime()).toBe(w.previous.from.getTime());
  });

  it("assigns boundary instants to exactly one window", () => {
    const a = new Date("2026-10-09T02:30:00Z");
    const w = windowsFor(a);
    expect(windowOf(w.current.from, w)).toBe("current"); // inclusive start
    expect(windowOf(new Date(w.current.from.getTime() - 1), w)).toBe("previous");
    expect(windowOf(w.previous.from, w)).toBe("previous");
    expect(windowOf(new Date(w.previous.from.getTime() - 1), w)).toBeNull();
    expect(windowOf(a, w)).toBeNull(); // exclusive end
    expect(windowOf(new Date(a.getTime() - 1), w)).toBe("current");
  });
});
