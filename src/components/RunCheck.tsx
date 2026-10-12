"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** The hand-drawn checkmark that draws itself when a run finishes. Static (fully drawn) for reduced motion. */
export default function RunCheck() {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const circle = ref.current!.querySelector("circle");
      const tick = ref.current!.querySelector("path");
      if (circle) gsap.fromTo(circle, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.inOut" });
      if (tick) gsap.fromTo(tick, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out", delay: 0.35 });
    });
    return () => mm.revert();
  }, { scope: ref });
  return (
    <svg ref={ref} className="checkbig" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" pathLength={1} />
      <path d="M18 33 28 43 46 22" pathLength={1} />
    </svg>
  );
}
