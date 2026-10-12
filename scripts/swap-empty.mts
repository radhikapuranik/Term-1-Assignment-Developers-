// Temporarily swaps in empty runs/briefs tables (on), or restores the originals (off). Used only for the empty-state screenshots.
import { q } from "../src/lib/db";
const mode = process.argv[2];
if (mode === "on") {
  await q("alter table briefs rename to briefs_hold");
  await q("alter table runs rename to runs_hold");
  await q("create table runs (like runs_hold including all)");
  await q("create table briefs (like briefs_hold including all)");
  console.log("empty tables in place");
} else if (mode === "off") {
  await q("drop table if exists briefs");
  await q("drop table if exists runs");
  await q("alter table runs_hold rename to runs");
  await q("alter table briefs_hold rename to briefs");
  const n = await q<{ runs: string; briefs: string }>("select (select count(*) from runs) runs, (select count(*) from briefs) briefs");
  console.log("restored:", JSON.stringify(n[0]));
}
