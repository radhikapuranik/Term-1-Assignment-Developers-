"use client";
import { useState } from "react";

export function CopyBrief({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <span>
      <button type="button" className="btn secondary small" onClick={copy}>Copy brief as text</button>
      <span className="small muted" role="status" aria-live="polite" style={{ marginLeft: 8 }}>
        {state === "ok" ? "Copied" : state === "err" ? "Copy failed, select the text manually" : ""}
      </span>
    </span>
  );
}
