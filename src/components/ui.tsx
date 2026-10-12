import { SOURCE_NAMES, type Source, type TrendKind } from "@/lib/types";

const I = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function TrendIcon({ kind }: { kind: TrendKind }) {
  switch (kind) {
    case "up": return <svg {...I}><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /></svg>;
    case "down":
    case "dropped": return <svg {...I}><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" /></svg>;
    case "flat": return <svg {...I}><path d="M2 6h8M7 3l3 3-3 3" /></svg>;
    case "new": return <svg {...I}><path d="M6 2v8M2 6h8" /></svg>;
    case "incomplete": return <svg {...I}><path d="M6 1.8 11 10.2H1L6 1.8ZM6 5v2.4M6 8.8v.01" /></svg>;
    default: return <svg {...I}><path d="M3 6h6" /></svg>;
  }
}

const SHORT: Record<TrendKind, string> = {
  up: "Up", down: "Down", flat: "Flat", new: "New", dropped: "Dropped to zero",
  incomplete: "Incomplete", insufficient: "Too little data", zero: "Confirmed zero",
};

export function TrendChip({ kind, label }: { kind: TrendKind; label?: string }) {
  return (
    <span className={`chip ${kind}`} title={label ?? SHORT[kind]}>
      <TrendIcon kind={kind} />
      {SHORT[kind]}
    </span>
  );
}

export function trendExplain(kind: TrendKind, minMentions: number): string {
  switch (kind) {
    case "incomplete": return "Data unavailable: a source did not respond, so no trend is claimed";
    case "zero": return "0 mentions (confirmed: all sources responded)";
    case "insufficient": return `Too little data to call a trend (needs ${minMentions} mentions across both weeks)`;
    case "new": return "New: no mentions last week";
    case "dropped": return "Dropped to zero this week";
    case "up": return "More mentions than last week";
    case "down": return "Fewer mentions than last week";
    default: return "About the same as last week";
  }
}

export function SourceBadge({ source }: { source: Source }) {
  return <span className="badge" title={SOURCE_NAMES[source]}>{source === "so" ? "SO" : source === "hn" ? "HN" : "Dev.to"}</span>;
}

const STATUS_LABEL: Record<string, string> = { sent: "Sent", partial: "Partial", failed: "Failed", running: "Running" };
export function StatusChip({ status }: { status: string }) {
  return <span className={`chip status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/** Paired horizontal bars on a shared zero-based scale, with direct value labels. */
export function PairedBars({ current, previous, max, label }: { current: number; previous: number; max: number; label: string }) {
  const W = 120;
  const scale = max > 0 ? W / max : 0;
  const bw = (n: number) => Math.max(n > 0 ? 2 : 0, n * scale);
  return (
    <svg viewBox="0 0 170 28" width="170" height="28" role="img" aria-label={label} style={{ maxWidth: "100%" }}>
      <rect className="barrect" data-bar x="0" y="2" width={bw(current)} height="10" rx="1.5" fill="var(--accent)" />
      <text x={bw(current) + 5} y="11" fontSize="10" fontFamily="var(--mono)" fill="currentColor">{current}</text>
      <rect className="barrect" data-bar x="0" y="16" width={bw(previous)} height="10" rx="1.5" fill="var(--muted)" opacity="0.55" />
      <text x={bw(previous) + 5} y="25" fontSize="10" fontFamily="var(--mono)" fill="var(--muted)">{previous}</text>
      <line x1="0.5" y1="0" x2="0.5" y2="28" stroke="var(--hair)" />
    </svg>
  );
}

export function Sparkline({ values, incomplete, label }: { values: number[]; incomplete: boolean[]; label: string }) {
  const W = 200, H = 48, P = 6;
  const lo = Math.min(...values), hi = Math.max(...values);
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, hi * 0.25, 1); // a flat series sits mid-height instead of hugging the bottom
  const x = (i: number) => P + (values.length === 1 ? 0 : (i * (W - 2 * P)) / (values.length - 1));
  const y = (v: number) => H / 2 - ((v - mid) / span) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="var(--hair)" strokeDasharray="2 4" />
      <polyline points={pts} pathLength={1} data-draw="scroll" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 4 : 2} fill={incomplete[i] ? "var(--surface)" : i === last ? "var(--accent)" : "var(--ink)"} stroke={incomplete[i] ? "var(--incomplete)" : "none"} strokeWidth={incomplete[i] ? 1.5 : 0} />
      ))}
    </svg>
  );
}
