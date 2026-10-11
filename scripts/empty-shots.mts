// Temporarily swaps in empty runs/briefs tables, takes the empty-state screenshots, then restores the originals.
import { q } from "../src/lib/db";
import { execFileSync } from "node:child_process";

let swapped = false;
try {
  await q("alter table briefs rename to briefs_hold");
  await q("alter table runs rename to runs_hold");
  swapped = true;
  await q("create table runs (like runs_hold including all)");
  await q("create table briefs (like briefs_hold including all)");
  console.log(execFileSync("node", ["--import", "tsx", "scripts/screenshots.mts", "empty"], { encoding: "utf8" }));
} finally {
  if (swapped) {
    await q("drop table if exists briefs");
    await q("drop table if exists runs");
    await q("alter table runs_hold rename to runs");
    await q("alter table briefs_hold rename to briefs");
    const n = await q<{ runs: string; briefs: string }>("select (select count(*) from runs) runs, (select count(*) from briefs) briefs");
    console.log("restored:", JSON.stringify(n[0]));
  }
}
