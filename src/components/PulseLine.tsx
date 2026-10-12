"use client";
import { useEffect, useMemo, useRef } from "react";
import type { Spike } from "@/lib/highlights";

/**
 * The hand-drawn pulse line. Its shape is generated from real statistics:
 * a tall heartbeat spike over each rising category, a shallow dip for a falling one, a tiny bump otherwise.
 */
export function PulseLine({ spikes, variant = "hero", id }: { spikes: Spike[]; variant?: "hero" | "phone" | "mini"; id: string }) {
  const hero = variant !== "mini";
  const phone = variant === "phone";
  // Each variant has its own proportions, so spikes stay tall and readable on a 360 px screen.
  const W = variant === "hero" ? 1000 : phone ? 360 : 200;
  const H = variant === "hero" ? 180 : phone ? 150 : 40;
  const base = variant === "hero" ? 110 : phone ? 100 : 26;
  const amp = variant === "hero" ? 96 : phone ? 78 : 20;
  const ref = useRef<SVGSVGElement>(null);

  const { d, peaks } = useMemo(() => {
    const n = Math.max(spikes.length, 1);
    const seg = W / n;
    const wob = (i: number, k: number) => (((i * 7 + k * 13) % 5) - 2) * (hero ? 1.2 : 0.3); // deterministic hand-drawn wobble
    let path = `M 0 ${base}`;
    const pk: { x: number; y: number }[] = [];
    spikes.forEach((s, i) => {
      const cx = seg * (i + 0.5);
      const h = s.height * amp;
      const u = seg / 14; // unit so each beat scales with the width of its slot
      path += ` L ${cx - 6 * u} ${base + wob(i, 1)}`;
      path += ` Q ${cx - 5 * u} ${base - Math.abs(h) * 0.18} ${cx - 3.6 * u} ${base}`; // small bump before the beat
      path += ` L ${cx - 1.6 * u} ${base + Math.abs(h) * 0.14}`; // dip
      path += ` L ${cx} ${base - h}`; // the spike (negative height gives a dip below the line)
      path += ` L ${cx + 1.6 * u} ${base + Math.abs(h) * 0.34 + wob(i, 2)}`;
      path += ` L ${cx + 3 * u} ${base}`;
      path += ` Q ${cx + 4.6 * u} ${base - Math.abs(h) * 0.2} ${cx + 6 * u} ${base + wob(i, 3)}`;
      pk.push({ x: cx, y: base - h });
    });
    path += ` L ${W} ${base}`;
    return { d: path, peaks: pk };
  }, [spikes, hero, base, amp, W]);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const on = (e: Event) => {
      const cat = (e as CustomEvent<{ category: string | null }>).detail?.category ?? null;
      svg.querySelectorAll<SVGElement>("[data-cat]").forEach((el) => {
        const hit = el.getAttribute("data-cat") === cat;
        if (el.tagName === "circle") el.style.transform = hit ? "scale(1.9)" : "";
        else el.classList.toggle("on", hit);
      });
    };
    window.addEventListener("pulse:focus", on);
    return () => window.removeEventListener("pulse:focus", on);
  }, []);

  const label = `Pulse line built from this week's statistics: ${spikes.map((s) => `${s.category}, ${s.count} mentions, ${s.kind === "up" ? "rising" : s.kind === "down" || s.kind === "dropped" ? "falling" : s.kind === "new" ? "new" : "no trend claimed"}`).join("; ")}.`;

  return (
    <svg ref={ref} className="pulse" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio={hero ? "xMidYMid meet" : "none"} data-pulse={id}>
      <line className="base" x1="0" x2={W} y1={base} y2={base} />
      <path className="line" d={d} {...(hero ? { pathLength: 1, "data-draw": "hero" } : { vectorEffect: "non-scaling-stroke" })} />
      {spikes.map((s, i) => (
        <g key={s.category}>
          <circle className={`dot ${s.kind}`} data-cat={s.category} cx={peaks[i].x} cy={peaks[i].y} r={variant === "hero" ? 7 : phone ? 6 : 3} style={{ transition: "transform .3s cubic-bezier(.34,1.56,.64,1)" }} />
          {variant === "hero" && <text className="lbl" data-cat={s.category} x={peaks[i].x} y={base + (s.height < 0 ? 46 : 38)}>{s.label}</text>}
        </g>
      ))}
    </svg>
  );
}
