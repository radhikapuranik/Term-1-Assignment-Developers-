// Applies db/schema.sql to the Neon database in DATABASE_URL, then checks that every table and the seed rows exist.
// Usage: npm run db:setup
import { readFileSync } from "node:fs";
import { q } from "../src/lib/db";

const TABLES = ["categories", "topics", "settings", "posts", "post_matches", "runs", "weekly_stats", "briefs"];

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is empty in .env.local. Paste your Neon connection string there first.");
  process.exit(1);
}
const raw = readFileSync("db/schema.sql", "utf8");
// Splits on semicolons at the end of a line, but not inside a $$ ... $$ block (the migration is a DO block).
const statements: string[] = [];
{
  let cur = "";
  let inDollar = false;
  for (const line of raw.split("\n")) {
    if (!inDollar && line.trim().startsWith("--")) continue;
    cur += line + "\n";
    if (((line.match(/\$\$/g) ?? []).length) % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trim().endsWith(";")) { statements.push(cur.trim().replace(/;$/, "")); cur = ""; }
  }
  if (cur.trim()) statements.push(cur.trim());
}

try {
  for (const st of statements) await q(st);
  console.log(`Applied db/schema.sql (${statements.length} statements). It is safe to run again.\n`);
  const have = (await q<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public'")).map((r) => r.table_name);
  for (const t of TABLES) {
    const n = have.includes(t) ? Number((await q<{ n: string }>(`select count(*) as n from ${t}`))[0].n) : null;
    console.log(`${n === null ? "MISSING" : "OK     "} table ${t.padEnd(13)} ${n === null ? "" : `${n} rows`}`);
  }
  const topics = Number((await q<{ n: string }>("select count(*) as n from topics"))[0].n);
  const cats = Number((await q<{ n: string }>("select count(*) as n from categories"))[0].n);
  const settings = (await q<{ key: string }>("select key from settings order by key")).map((r) => r.key);
  console.log(`\nSeed check: ${topics} topics in ${cats} categories (a fresh install has 16 in 5; more is fine), settings: ${settings.join(", ")} (expected 5).`);
  const ok = TABLES.every((t) => have.includes(t)) && topics >= 16 && settings.length >= 5;
  console.log(ok ? "All 8 tables exist and the seed data is in place." : "Something is missing, see above.");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.log(`Failed: ${(e as Error).message}`);
  process.exit(1);
}
