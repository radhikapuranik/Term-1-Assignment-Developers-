"use client";
import { useSyncExternalStore } from "react";

const EVENT = "pulse:theme";

function subscribe(cb: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVENT, cb);
  mq.addEventListener("change", cb);
  return () => { window.removeEventListener(EVENT, cb); mq.removeEventListener("change", cb); };
}
function isDark(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    const next = dark ? "light" : "dark";
    const el = document.documentElement;
    el.classList.add("theme-anim");
    el.setAttribute("data-theme", next);
    try { localStorage.setItem("pulse-theme", next); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVENT));
    window.setTimeout(() => el.classList.remove("theme-anim"), 450);
  }
  return (
    <button type="button" className="iconbtn" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
      )}
    </button>
  );
}
