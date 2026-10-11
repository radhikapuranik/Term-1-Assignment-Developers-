import { q, loadConfig, loadWindowData } from "../src/lib/db";
import { windowsFor } from "../src/lib/windows";
import { computeStats } from "../src/lib/stats";
import { assembleBase, evidenceFor } from "../src/lib/brief";
import { findUnresolved } from "../src/lib/unresolved";
import { geminiJson } from "../src/lib/gemini";
import { z } from "zod";

const run = (await q<{ anchor: string }>("select anchor from runs order by started_at desc limit 1"))[0];
const anchor = new Date(run.anchor);
const w = windowsFor(anchor);
const { topics, settings } = await loadConfig();
const { posts, matches } = await loadWindowData(w.fetchFrom, anchor);
const stats = computeStats({ matches, activeTopics: topics, windows: w, settings, outcomes: [] });
const base = assembleBase({ anchor, now: new Date(), topics, stats: stats.rows, totals: stats.totals, posts, matches, unresolved: findUnresolved(posts), outcomes: [], currentFrom: w.current.from, classified: 0, unclassified: 0 });
const input = base.categories.map((c) => ({ category: c.category, evidence: evidenceFor(c.category, posts, matches, w.current.from, anchor, 8).map((p) => ({ id: `${p.source}:${p.post_id}`, title: p.title })) }));
const prompt = `Data:\n${JSON.stringify(input)}`;
console.log("prompt chars", prompt.length);
import { generateCommentary } from "../src/lib/brief";
const ev = new Map(base.categories.map((c) => [c.category, evidenceFor(c.category, posts, matches, w.current.from, anchor, 8)]));
const t = Date.now();
try {
  const r = await generateCommentary(base, ev, findUnresolved(posts), Date.now() + 100000);
  console.log("OK ms", Date.now() - t, "violations", r.violations, "summary:", r.executive_summary);
  console.log(JSON.stringify(r.categories[0], null, 1));
} catch (e) { console.log("ERR ms", Date.now() - t, (e as Error).message); }
void geminiJson; void z;
