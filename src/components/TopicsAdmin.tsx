"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminCategory } from "@/lib/topics-admin";

const KEY = "pulse-topics-passcode";

export function TopicsAdmin() {
  const [pass, setPass] = useState(() => { try { return typeof window === "undefined" ? "" : (sessionStorage.getItem(KEY) ?? ""); } catch { return ""; } });
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [msg, setMsg] = useState("");
  const [isErr, setIsErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const passInput = useRef<HTMLInputElement>(null);

  const call = useCallback(async (passcode: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/topics", { method: body ? "POST" : "GET", headers: { "x-run-passcode": passcode, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as { categories?: AdminCategory[]; message?: string; error?: string };
      if (res.status === 401) { setCats(null); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } setIsErr(true); setMsg("That passcode is not right."); return false; }
      if (!res.ok) { setIsErr(true); setMsg(data.error ?? `Something went wrong (HTTP ${res.status}).`); return false; }
      if (data.categories) setCats(data.categories);
      if (body) { setIsErr(false); setMsg(data.message ?? "Saved."); }
      return true;
    } catch {
      setIsErr(true); setMsg("The request did not finish. Check your connection and try again.");
      return false;
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!pass) return;
    const id = window.setTimeout(() => void call(pass), 0); // restore the unlocked list for this browser tab
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const p = passInput.current?.value ?? "";
    if (!p) { setIsErr(true); setMsg("Enter the passcode first."); return; }
    if (await call(p)) { setPass(p); try { sessionStorage.setItem(KEY, p); } catch { /* ignore */ } setMsg(""); }
  }
  const act = (body: Record<string, unknown>) => call(pass, body);

  if (!cats) {
    return (
      <form onSubmit={unlock} className="runform" style={{ justifyContent: "flex-start", marginTop: 24 }}>
        <label className="sr-only" htmlFor="tp">Passcode</label>
        <input id="tp" ref={passInput} className="input" type="password" placeholder="Passcode" autoComplete="off" autoFocus />
        <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Unlock"}</button>
        <p className={`status-line${isErr ? " err" : ""}`} role="status" aria-live="polite" style={{ textAlign: "left", flexBasis: "100%" }}>{msg || "Use the same passcode as Run now."}</p>
      </form>
    );
  }

  return (
    <div style={{ marginTop: 24, display: "grid", gap: 32 }}>
      <p className={`status-line topics-msg${isErr ? " err" : ""}`} role="status" aria-live="polite" style={{ textAlign: "left", maxWidth: "none", minHeight: "3.2em" }}>
        {busy ? "Working… adding a keyword fetches the last 14 days, which can take up to half a minute." : msg}
      </p>

      <AddCategory busy={busy} onAdd={(name, keyword) => act({ action: "addCategory", name, keyword })} />

      {cats.map((c) => (
        <section key={c.id} className="topic-cat" aria-label={c.name}>
          <div className="topic-head">
            <InlineEdit key={`c${c.id}-${c.name}`} label={`Category name for ${c.name}`} value={c.name} busy={busy} onSave={(v) => act({ action: "renameCategory", id: c.id, name: v })} big />
            <span className={`chip ${c.active ? "status-sent" : "insufficient"}`}>{c.active ? "On" : "Off"}</span>
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => act({ action: "setCategoryActive", id: c.id, active: !c.active })}>{c.active ? "Switch off" : "Switch on"}</button>
          </div>
          <ul className="topic-list">
            {c.topics.map((t) => (
              <li key={t.id} className={t.active && c.active ? "" : "off"}>
                <InlineEdit key={`t${t.id}-${t.keyword}`} label={`Keyword text for ${t.keyword}`} value={t.keyword} busy={busy} onSave={(v) => act({ action: "editKeyword", id: t.id, keyword: v })} />
                <label className="sr-only" htmlFor={`mv-${t.id}`}>Move {t.keyword} to another category</label>
                <select id={`mv-${t.id}`} className="select" value="" disabled={busy || cats.length < 2} onChange={(e) => e.target.value && act({ action: "moveKeyword", id: t.id, categoryId: Number(e.target.value) })}>
                  <option value="">Move to…</option>
                  {cats.filter((x) => x.id !== c.id && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" className="btn small secondary" disabled={busy} onClick={() => act({ action: "setKeywordActive", id: t.id, active: !t.active })}>{t.active ? "Switch off" : "Switch on"}</button>
              </li>
            ))}
            {c.topics.length === 0 && <li className="muted small">No keywords yet.</li>}
          </ul>
          {c.active && <AddKeyword busy={busy} category={c.name} onAdd={(keyword) => act({ action: "addKeyword", categoryId: c.id, keyword })} />}
        </section>
      ))}
    </div>
  );
}

function InlineEdit({ value, label, onSave, busy, big }: { value: string; label: string; onSave: (v: string) => Promise<boolean>; busy: boolean; big?: boolean }) {
  const [v, setV] = useState(value);
  return (
    <form className="inline-edit" onSubmit={async (e) => { e.preventDefault(); if (v.trim() !== value) await onSave(v); }}>
      <label className="sr-only" htmlFor={`ie-${label}`}>{label}</label>
      <input id={`ie-${label}`} className={`input${big ? " big" : ""}`} value={v} onChange={(e) => setV(e.target.value)} maxLength={80} disabled={busy} />
      <button type="submit" className="btn small secondary" disabled={busy || v.trim() === value}>Save</button>
    </form>
  );
}

function AddKeyword({ onAdd, busy, category }: { onAdd: (k: string) => Promise<boolean>; busy: boolean; category: string }) {
  const [v, setV] = useState("");
  return (
    <form className="inline-edit" onSubmit={async (e) => { e.preventDefault(); if (v.trim() && (await onAdd(v))) setV(""); }}>
      <label className="sr-only" htmlFor={`ak-${category}`}>New keyword for {category}</label>
      <input id={`ak-${category}`} className="input" placeholder="New keyword" value={v} onChange={(e) => setV(e.target.value)} maxLength={80} disabled={busy} />
      <button type="submit" className="btn small" disabled={busy || !v.trim()}>Add keyword</button>
    </form>
  );
}

function AddCategory({ onAdd, busy }: { onAdd: (name: string, keyword: string) => Promise<boolean>; busy: boolean }) {
  const [name, setName] = useState("");
  const [kw, setKw] = useState("");
  return (
    <form className="topic-cat inline-edit" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && (await onAdd(name, kw))) { setName(""); setKw(""); } }}>
      <label className="sr-only" htmlFor="nc-name">New category name</label>
      <input id="nc-name" className="input" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={busy} />
      <label className="sr-only" htmlFor="nc-kw">First keyword (optional)</label>
      <input id="nc-kw" className="input" placeholder="First keyword (optional)" value={kw} onChange={(e) => setKw(e.target.value)} maxLength={80} disabled={busy} />
      <button type="submit" className="btn" disabled={busy || !name.trim()}>Add category</button>
    </form>
  );
}
