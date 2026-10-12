"use client";
import { useEffect, useState } from "react";
import type { Spike } from "@/lib/highlights";
import { PulseLine } from "./PulseLine";
import { ThemeToggle } from "./ThemeToggle";

export interface NavItem { id: string; label: string }

export function SectionNav({ items, spikes }: { items: NavItem[]; spikes: Spike[] | null }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [menu]);

  const label = items.find((i) => i.id === current)?.label ?? "Sections";
  return (
    <nav className="snav" aria-label="Sections">
      <div className="snav-in">
        <a className="brand" href="#top" aria-label="Developer Community Pulse, back to top">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 13h4l3-9 5 17 3-8h6" /></svg>
          Pulse
        </a>
        <div className="snav-links">
          {items.map((i) => (
            <a key={i.id} href={`#${i.id}`} aria-current={current === i.id ? "true" : undefined}>{i.label}</a>
          ))}
        </div>
        <div className="snav-phone">
          <button type="button" aria-expanded={menu} aria-controls="snav-menu" onClick={() => setMenu((m) => !m)}>{label} {menu ? "▴" : "▾"}</button>
        </div>
        {spikes && spikes.length > 0 && (
          <div className="mini-pulse" aria-hidden="true"><PulseLine spikes={spikes} variant="mini" id="mini" /></div>
        )}
        <div className="snav-tools"><ThemeToggle /></div>
      </div>
      {menu && (
        <div className="snav-menu" id="snav-menu">
          {items.map((i) => (
            <a key={i.id} href={`#${i.id}`} aria-current={current === i.id ? "true" : undefined} onClick={() => setMenu(false)}>{i.label}</a>
          ))}
        </div>
      )}
    </nav>
  );
}
