// Compares what the redesigned page shows with the database for the latest run with a brief.
import { chromium } from "playwright";
import { q } from "../src/lib/db";

const base = process.argv[2] ?? "http://localhost:3100";
const run = (await q<{ id: string }>("select r.id from runs r join briefs b on b.run_id = r.id order by r.started_at desc limit 1"))[0];
const stats = await q<{ level: string; category: string; keyword: string; current_count: number; previous_count: number; pct_change: string | null; trend_label: string }>(
  "select level, category, keyword, current_count, previous_count, pct_change, trend_label from weekly_stats where run_id = $1", [run.id]);
const totals = (await q<{ content: { totals: { current: number; previous: number }; unresolved: unknown[] } }>("select content from briefs where run_id = $1", [run.id]))[0].content;

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })).newPage();
await p.goto(base, { waitUntil: "networkidle" });
let bad = 0;
const check = (what: string, shown: string | number, expected: string | number) => { const ok = String(shown) === String(expected); if (!ok) bad++; console.log(`${ok ? "OK  " : "DIFF"} ${what}: page=${shown} db=${expected}`); };

for (const c of stats.filter((s) => s.level === "category")) {
  const row = p.locator("#pain tbody tr", { has: p.getByRole("button", { name: c.category, exact: false }) }).first();
  const cells = await row.locator("td.num").allInnerTexts();
  check(`${c.category} this week`, cells[0].trim(), c.current_count);
  check(`${c.category} last week`, cells[1].trim(), c.previous_count);
  const pct = c.pct_change === null ? null : Number(c.pct_change);
  const kind = c.trend_label;
  const expected = kind === "New, no mentions last week" ? "New" : ["Up", "Down", "Flat", "Dropped to zero"].includes(kind) && pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "n/a";
  check(`${c.category} change`, cells[2].trim(), expected);
}
for (const k of stats.filter((s) => s.level === "keyword")) {
  const row = p.locator("#keywords tbody tr", { has: p.locator("td.first", { hasText: new RegExp(`^${k.keyword.replace(/[/]/g, "\\/")}$`) }) }).first();
  const cells = await row.locator("td.num").allInnerTexts();
  if (cells.length < 2 || cells[0].trim() !== String(k.current_count) || cells[1].trim() !== String(k.previous_count)) { bad++; console.log("DIFF keyword", k.keyword, cells, k.current_count, k.previous_count); }
}
console.log(`OK   ${stats.filter((s) => s.level === "keyword").length} keyword rows compared`);
const strip = await p.locator("#summary .stat .n").allInnerTexts();
check("unique posts this week", strip[0].split("/")[0].trim(), totals.totals.current);
check("unique posts last week", strip[0].split("/")[1].trim(), totals.totals.previous);
check("potentially unresolved", strip[2].trim(), totals.unresolved.length);
const hero = await p.locator(".hero-numbers .n").allInnerTexts();
check("hero: discussions", hero[0], totals.totals.current);
check("hero: unresolved", hero[2], totals.unresolved.length);
console.log(bad === 0 ? "\nALL NUMBERS ON THE PAGE MATCH THE DATABASE" : `\n${bad} MISMATCHES`);
await b.close();
process.exit(bad ? 1 : 0);
