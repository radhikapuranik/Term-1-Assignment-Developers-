"use client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Effect-only: draws the (already visible) flat pulse line once the script has loaded. Nothing for reduced motion. */
export default function FlatlineDraw({ targetId }: { targetId: string }) {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const p = document.getElementById(targetId);
      if (p) gsap.fromTo(p, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" });
    });
    return () => mm.revert();
  }, { dependencies: [targetId] });
  return null;
}
