"use client";
import { useId } from "react";
import dynamic from "next/dynamic";

const FlatlineDraw = dynamic(() => import("./FlatlineDraw"), { ssr: false });

/** A pulse line that has gone flat (404, error, empty states). Visible in the HTML; draws itself once the script loads. */
export function Flatline({ variant = "empty", label }: { variant?: "empty" | "notfound" | "error"; label: string }) {
  const id = useId();
  const d =
    variant === "empty" ? "M2 40 L150 40 L162 40 Q166 34 170 40 L176 46 L182 40 L360 40"
    : variant === "notfound" ? "M2 40 L220 40 L236 40 L244 26 L252 54 L260 40 L330 40 M338 30 L356 50 M356 30 L338 50"
    : "M2 40 L120 40 L132 12 L142 62 L152 40 L200 40 L214 40 M222 40 L232 40 M240 40 L250 40";
  return (
    <>
      <svg className="flatline" viewBox="0 0 364 80" role="img" aria-label={label}>
        <path id={id} d={d} pathLength={1} />
      </svg>
      <FlatlineDraw targetId={id} />
    </>
  );
}
