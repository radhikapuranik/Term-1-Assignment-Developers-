"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function RunNow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [isErr, setIsErr] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const passcode = input.current?.value ?? "";
    if (!passcode) {
      setIsErr(true);
      setMsg("Enter the Run now passcode first.");
      return;
    }
    setBusy(true);
    setIsErr(false);
    setMsg("Collecting live data and writing the brief. This takes up to a minute.");
    try {
      const res = await fetch("/api/run-now", { method: "POST", headers: { "x-run-passcode": passcode } });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string; status?: string };
      if (!res.ok) {
        setIsErr(true);
        setMsg(body.error ?? `Run now failed (HTTP ${res.status}).`);
      } else {
        setMsg(`Run finished: ${body.status}. ${body.message ?? ""}`);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setIsErr(true);
      setMsg("The request did not finish. Check the run history in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>Run now</button>
      ) : (
        <form className="runform" onSubmit={start}>
          <label className="sr-only" htmlFor="passcode">Run now passcode</label>
          <input id="passcode" ref={input} className="input" type="password" placeholder="Passcode" autoComplete="off" disabled={busy} autoFocus />
          <button type="submit" className="btn" disabled={busy}>{busy ? "Running…" : "Start run"}</button>
        </form>
      )}
      <p className={`status-line${isErr ? " err" : ""}`} role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
