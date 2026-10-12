"use client";
import { useEffect, useRef } from "react";

/** Starts the page motion after hydration. GSAP is a separate chunk, so it never delays first paint. */
export function MotionRoot({ children, runKey }: { children: React.ReactNode; runKey: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const el = root.current;
    if (!el) return;
    import("./motion/engine").then((m) => {
      if (!cancelled) stop = m.startMotion(el);
    });
    return () => { cancelled = true; stop?.(); };
  }, [runKey]);
  return <div ref={root}>{children}</div>;
}
