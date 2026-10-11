export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export interface Window {
  from: Date; // inclusive
  to: Date; // exclusive
}

export interface Windows {
  anchor: Date;
  current: Window;
  previous: Window;
  fetchFrom: Date;
}

/** Most recent Friday 02:30 UTC (08:00 IST) at or before `now`. */
export function scheduledAnchor(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 30, 0, 0),
  );
  while (d.getUTCDay() !== 5 || d.getTime() > now.getTime()) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

export function windowsFor(anchor: Date): Windows {
  const a = anchor.getTime();
  return {
    anchor,
    current: { from: new Date(a - WEEK_MS), to: anchor },
    previous: { from: new Date(a - 2 * WEEK_MS), to: new Date(a - WEEK_MS) },
    fetchFrom: new Date(a - 2 * WEEK_MS),
  };
}

/** Half-open membership: from <= t < to. */
export function inWindow(t: Date | string | number, w: Window): boolean {
  const ms = new Date(t).getTime();
  return ms >= w.from.getTime() && ms < w.to.getTime();
}

export function windowOf(t: Date | string | number, w: Windows): "current" | "previous" | null {
  if (inWindow(t, w.current)) return "current";
  if (inWindow(t, w.previous)) return "previous";
  return null;
}
