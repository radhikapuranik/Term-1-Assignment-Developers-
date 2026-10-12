"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/** A number that explains how it was counted: on hover, keyboard focus and tap. */
export function NumberTip({ children, text }: { children: React.ReactNode; text: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(320, window.innerWidth - 24);
    const x = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const below = r.top < 140;
    setPos({ x, y: below ? r.bottom + 10 : r.top - 10 });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("scroll", close); window.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        className="numtip"
        tabIndex={0}
        role="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={() => { if (open) setOpen(false); else show(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (open) setOpen(false); else show(); } }}
      >
        {children}
      </span>
      {open && (
        <span id={id} role="tooltip" className="tip" style={{ left: pos.x, top: pos.y, transform: pos.y < 150 ? "none" : "translateY(-100%)" }}>
          {text}
        </span>
      )}
    </>
  );
}
