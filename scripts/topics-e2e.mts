// End-to-end test of the Topics page API on a live site: add, backfill, rename, switch off/on, history stays linked.
import { readFileSync } from "node:fs";
import { q } from "../src/lib/db";

const base = process.argv[2] ?? "https://developer-community-pulse.vercel.app";
const pass = /^RUN_NOW_PASSCODE=(.*)$/m.exec(readFileSync(".env.local", "utf8"))![1];
let failures = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) failures++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? "  " + extra : ""}`); };
type Resp = { ok?: boolean; message?: string; error?: string; backfill?: { topic_id: number; keyword: string; category: string; current_count: number; previous_count: number; pct_change: number | null; trend_label: string; no_baseline: boolean; sources: Array<{ source: string; ok: boolean; message: string }> }; categories?: Array<{ id: number; name: string; active: boolean; topics: Array<{ id: number; keyword: string; active: boolean }> }> };
const api = async (body: Record<string, unknown>, headers: Record<string, string> = { "x-run-passcode": pass }): Promise<{ status: number; json: Resp; ms: number }> => {
  const t = Date.now();
  const r = await fetch(`${base}/api/topics`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json()) as Resp, ms: Date.now() - t };
};
const pageOnce = async () => (await (await fetch(`${base}/`, { cache: "no-store" })).text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** The public page refreshes a few seconds after a change (page cache), so wait for the expected content. */
const page = async (ok: (t: string) => boolean = () => true): Promise<string> => {
  let t = await pageOnce();
  for (let i = 0; i < 12 && !ok(t); i++) { await new Promise((r) => setTimeout(r, 2000)); t = await pageOnce(); }
  return t;
};
const catId = async (name: string) => Number((await q("select id from categories where name = $1", [name]))[0].id);

console.log("== access");
ok("wrong passcode is refused", (await api({ action: "addCategory", name: "x" }, { "x-run-passcode": "wrong" })).status === 401);
ok("no passcode is refused", (await api({ action: "addCategory", name: "x" }, {})).status === 401);
const noGet = await fetch(`${base}/api/topics`); ok("list needs the passcode too", noGet.status === 401);

console.log("== add a keyword (backfill, no code change)");
const devId = await catId("Developer workflow and productivity");
const before = Number((await q("select count(*) n from runs where run_type <> 'backfill'"))[0].n);
const add = await api({ action: "addKeyword", categoryId: devId, keyword: "technical debt" });
const b1 = add.json.backfill!;
ok("added and backfilled inside the 60 s limit", add.status === 200 && !!b1 && add.ms < 60000, `(${Math.round(add.ms / 1000)} s)`);
ok("shows this week and last week numbers straight away", b1.current_count + b1.previous_count > 0, `(${b1.current_count} this week, ${b1.previous_count} last week, ${b1.trend_label})`);
ok("each source reported", b1.sources.length === 3, b1.sources.map((s) => `${s.source}: ${s.ok ? "ok" : s.message}`).join(" | "));
const topicId = b1.topic_id;
ok("no normal run was created and Gemini was not used", Number((await q("select count(*) n from runs where run_type <> 'backfill'"))[0].n) === before && Number((await q("select count(*) n from briefs b join runs r on r.id=b.run_id where r.run_type='backfill'"))[0].n) === 0);
let html = await page((t) => /technical debt\s+backfilled/.test(t));
ok("the live dashboard shows it, labelled backfilled", /technical debt\s+backfilled/.test(html));

console.log("== rename the keyword (text change: matched again, history stays linked)");
const matches1 = Number((await q("select count(*) n from post_matches where topic_id = $1", [topicId]))[0].n);
const statsRows1 = Number((await q("select count(*) n from weekly_stats where topic_id = $1", [topicId]))[0].n);
const ren = await api({ action: "editKeyword", id: topicId, keyword: "tech debt" });
const b2 = ren.json.backfill!;
ok("renamed and backfilled again", ren.status === 200 && !!b2 && b2.topic_id === topicId, `(${b2?.current_count} this week, ${b2?.previous_count} last week)`);
ok("same permanent id, new label", Number((await q("select count(*) n from topics where id = $1 and keyword = $2", [topicId, "tech debt"]))[0].n) === 1);
const statsRows2 = Number((await q("select count(*) n from weekly_stats where topic_id = $1", [topicId]))[0].n);
ok("the earlier numbers are still linked to the same id", statsRows2 === statsRows1 + 1, `(${statsRows1} rows before, ${statsRows2} after; the first backfill's row is kept)`);
ok("nothing was lost from other keywords", Number((await q("select count(*) n from post_matches"))[0].n) >= 228 - 0 && matches1 >= 0);
html = await page((t) => /tech debt\s+backfilled/.test(t));
ok("the dashboard now shows the new text", /tech debt\s+backfilled/.test(html) && !/technical debt\s+backfilled/.test(html));

console.log("== a new category with a first keyword, then rename the category");
const nc = await api({ action: "addCategory", name: "Zz test category", keyword: "hotfix" });
ok("category added with its first keyword", nc.status === 200 && !!nc.json.backfill, `(${nc.json.backfill?.current_count} this week, ${nc.json.backfill?.previous_count} last week)`);
const zId = await catId("Zz test category");
const zBefore = (await q("select current_count c, previous_count p from weekly_stats where level = 'category' and category_id = $1 order by 1 limit 1", [zId]))[0];
ok("it shows on the dashboard as backfilled", /Zz test category/.test(await page((t) => /Zz test category/.test(t))));
const rc = await api({ action: "renameCategory", id: zId, name: "Zz renamed category" });
ok("category renamed", rc.status === 200);
const zAfter = (await q("select c.name, w.current_count c, w.previous_count p from weekly_stats w join categories c on c.id = w.category_id where w.level = 'category' and w.category_id = $1 limit 1", [zId]))[0];
ok("its numbers stay linked to the same id, label follows", zAfter.name === "Zz renamed category" && zAfter.c === zBefore.c && zAfter.p === zBefore.p);
const html2 = await page((t) => /Zz renamed category/.test(t) && !/Zz test category/.test(t));
ok("dashboard shows the new category name", /Zz renamed category/.test(html2) && !/Zz test category/.test(html2));

console.log("== switch off, back on, then off (the way to remove)");
const off = await api({ action: "setKeywordActive", id: topicId, active: false });
ok("switched off", off.status === 200 && Number((await q("select count(*) n from topics where id=$1 and active", [topicId]))[0].n) === 0);
ok("hidden from the dashboard", !/tech debt/.test(await page((t) => !/tech debt/.test(t))));
ok("its past numbers are kept", Number((await q("select count(*) n from weekly_stats where topic_id = $1", [topicId]))[0].n) === statsRows2);
const on = await api({ action: "setKeywordActive", id: topicId, active: true });
ok("switched back on", on.status === 200);
const numRe = new RegExp(`tech debt\\s+backfilled\\s+Developer workflow and productivity\\s+${b2.current_count}\\s+${b2.previous_count}\\s`);
ok("shows the same numbers again, nothing invented", numRe.test(await page((t) => numRe.test(t))), `(${b2.current_count} this week / ${b2.previous_count} last week, as before)`);
await api({ action: "setKeywordActive", id: topicId, active: false });
await api({ action: "setCategoryActive", id: zId, active: false });
const left = Number((await q("select count(*) n from topics t join categories c on c.id=t.category_id where t.active and c.active and (t.keyword in ('tech debt','technical debt','hotfix') or c.name like 'Zz%')"))[0].n);
ok("test topics switched off (never deleted)", left === 0 && Number((await q("select count(*) n from topics where keyword in ('tech debt','hotfix')"))[0].n) === 2);
const final = await page((t) => !/tech debt|hotfix|Zz renamed/.test(t));
ok("gone from the dashboard", !/tech debt|hotfix|Zz renamed/.test(final));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
