"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const RunCheck = dynamic(() => import("./RunCheck"), { ssr: false, loading: () => <span className="checkbig" /> });

const STAGES: Array<{ key: string; label: string }> = [
  { key: "fetch", label: "Fetching sources" },
  { key: "count", label: "Counting" },
  { key: "analyse", label: "Analysing with Gemini" },
  { key: "write", label: "Writing the brief" },
  { key: "email", label: "Sending the email" },
];

type Phase = "idle" | "form" | "running" | "done" | "error";

function plainError(status: number, body: { error?: string }): string {
  if (status === 401) return "That passcode is not right. Please check it and try again.";
  if (status === 429) return body.error ?? "A run started in the last 5 minutes. Please wait a little and try again.";
  if (status >= 500) return "Something went wrong on our side while collecting data. Nothing was lost. You can try again.";
  return body.error ?? `The run did not start (HTTP ${status}).`;
}

export function RunNow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState("fetch");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  const stopPolling = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => stopPolling, []);

  async function poll() {
    try {
      const r = await fetch("/api/run-status", { cache: "no-store" });
      if (!r.ok) return;
      const s = (await r.json()) as { status?: string; stage?: string | null; started_at?: string };
      if (s.started_at && new Date(s.started_at).getTime() >= startedAt.current - 5000 && s.stage && STAGES.some((x) => x.key === s.stage)) setStage(s.stage);
    } catch { /* the next poll will try again */ }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const passcode = input.current?.value ?? "";
    if (!passcode) { setError("Enter the Run now passcode first."); setPhase("error"); return; }
    setPhase("running");
    setStage("fetch");
    setError("");
    startedAt.current = Date.now();
    timer.current = window.setInterval(poll, 2000);
    try {
      const res = await fetch("/api/run-now", { method: "POST", headers: { "x-run-passcode": passcode } });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string; status?: string };
      stopPolling();
      if (!res.ok) { setError(plainError(res.status, body)); setPhase("error"); return; }
      if (body.status === "failed") { setError("The run finished but could not produce a brief. " + (body.message ?? "")); setPhase("error"); router.refresh(); return; }
      setMessage(body.status === "sent" ? "The brief is saved and the email is on its way." : `The brief is saved. Some parts were unavailable (${body.message ?? "see the banner"}).`);
      setPhase("done");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      stopPolling();
      setError("The connection dropped before the run finished. It may still be running: check the run history in a minute, or try again.");
      setPhase("error");
    }
  }

  const idx = STAGES.findIndex((s) => s.key === stage);
  const live = phase === "running" ? `${STAGES[Math.max(idx, 0)].label}…` : phase === "done" ? "Run finished." : phase === "error" ? error : "";

  return (
    <div className="runbox">
      {phase === "idle" && <button type="button" className="btn" onClick={() => setPhase("form")}>Run now</button>}
      {phase === "form" && (
        <form className="runform" onSubmit={start}>
          <label className="sr-only" htmlFor="passcode">Run now passcode</label>
          <input id="passcode" ref={input} className="input" type="password" placeholder="Passcode" autoComplete="off" autoFocus />
          <button type="submit" className="btn">Start run</button>
        </form>
      )}
      {phase !== "idle" && phase !== "form" && (
        <div className="runpanel">
          <h2>{phase === "done" ? "All done" : phase === "error" ? "That did not work" : "Running now"}</h2>
          {phase === "running" && (
            <ol className="stages">
              {STAGES.map((s, i) => (
                <li key={s.key} className={i < idx ? "done" : i === idx ? "active" : ""} aria-current={i === idx ? "step" : undefined}>
                  <span className="mark">{i < idx && <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9l5-6" /></svg>}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          )}
          {phase === "done" && (
            <div className="run-result">
              <RunCheck />
              <p>{message}</p>
            </div>
          )}
          {phase === "error" && <p role="alert">{error}</p>}
          {phase === "running" && <p className="small muted">This takes up to a minute. You can keep reading.</p>}
          {phase !== "running" && (
            <div className="run-actions">
              {phase === "error" && <button type="button" className="btn small" onClick={() => setPhase("form")}>Retry</button>}
              <button type="button" className="btn small secondary" onClick={() => setPhase("idle")}>Close</button>
            </div>
          )}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
    </div>
  );
}
