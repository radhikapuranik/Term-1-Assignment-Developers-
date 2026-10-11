const IST = "Asia/Kolkata";

export function formatIst(d: Date | string, withTime = true): string {
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = `${g("weekday")} ${g("day")} ${g("month")} ${g("year")}`;
  return withTime ? `${day}, ${g("hour")}:${g("minute")} IST` : day;
}

/** "Fri 9 Oct 08:00" style, for the window sentence. */
export function formatIstShort(d: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")} ${g("hour")}:${g("minute")}`;
}

export function relativeTime(d: Date | string, now = new Date()): string {
  const diff = now.getTime() - new Date(d).getTime();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let s: string;
  if (m < 1) return "just now";
  if (m < 60) s = unit(m, "minute");
  else if (m < 60 * 24) s = unit(Math.round(m / 60), "hour");
  else s = unit(Math.round(m / 1440), "day");
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function windowSentence(anchor: Date | string): string {
  const a = new Date(anchor).getTime();
  const week = 7 * 24 * 3600 * 1000;
  return `${formatIstShort(new Date(a - week))} to ${formatIstShort(new Date(a))} IST versus the 7 days before`;
}

export function weekEndingLabel(anchor: Date | string): string {
  return formatIst(anchor, false);
}
