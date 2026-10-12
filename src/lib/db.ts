import { neon } from "@neondatabase/serverless";
import { sleep } from "./http";
import type { PostRow, Settings, Topic } from "./types";
import type { MatchRow } from "./stats";

type Row = Record<string, unknown>;
type Sql = { query: (text: string, params?: unknown[]) => Promise<Row[]> };

let sql: Sql | null = null;
let awake = false;

function client(): Sql {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env.local (and to the Vercel environment variables).");
  sql = neon(url) as unknown as Sql;
  return sql;
}

/** Dates become ISO strings, so the rest of the code deals only in plain JSON-like values. */
function normalize<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    // Neon returns bigint ids as strings: make permanent ids real numbers (post_id and uuids are left alone)
    else if ((k === "id" || k === "category_id" || k === "topic_id") && typeof v === "string" && /^\d+$/.test(v)) out[k] = Number(v);
    else out[k] = v;
  }
  return out as T;
}

const WAKE_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];

/**
 * Neon pauses an idle database. The first connection of each process retries a few times
 * with a short delay while it wakes up, then fails with a clear message.
 */
async function ensureAwake(): Promise<void> {
  if (awake) return;
  let last = "";
  for (let i = 0; i <= WAKE_DELAYS_MS.length; i++) {
    try {
      await client().query("select 1");
      awake = true;
      return;
    } catch (e) {
      last = (e as Error).message;
      if (/DATABASE_URL is not set/.test(last)) throw e;
      if (i < WAKE_DELAYS_MS.length) await sleep(WAKE_DELAYS_MS[i]);
    }
  }
  throw new Error(`Could not connect to the Neon database after ${WAKE_DELAYS_MS.length + 1} tries (it may be waking from sleep, or DATABASE_URL is wrong): ${last}`);
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureAwake();
  const rows = await client().query(text, params);
  return rows.map((r) => normalize<T>(r));
}

export const dbConfigured = () => !!process.env.DATABASE_URL;
const json = (v: unknown) => JSON.stringify(v);

export async function loadConfig(): Promise<{ topics: Topic[]; settings: Settings }> {
  const topics = await q<Topic>(
    `select t.id, t.category_id, c.name as category, t.keyword, t.active, t.created_at
       from topics t join categories c on c.id = t.category_id
      where t.active and c.active order by c.name, t.id`,
  );
  const rows = await q<{ key: string; value: unknown }>("select key, value from settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings: Settings = {
    recipient_email: String(map.recipient_email ?? ""),
    min_mentions: Number(map.min_mentions ?? 5),
    flat_threshold_pct: Number(map.flat_threshold_pct ?? 10),
    devto_tags: Array.isArray(map.devto_tags) ? (map.devto_tags as string[]) : [],
    classify_cap: Number(map.classify_cap ?? 120),
  };
  return { topics, settings };
}

export async function loadWindowData(from: Date, to: Date): Promise<{ posts: PostRow[]; matches: MatchRow[] }> {
  const posts = await q<PostRow>("select * from posts where created_at >= $1 and created_at < $2 order by source, post_id", [from.toISOString(), to.toISOString()]);
  const matches = await q<MatchRow>(
    `select m.source, m.post_id, m.topic_id, p.created_at
       from post_matches m join posts p on p.source = m.source and p.post_id = m.post_id
      where p.created_at >= $1 and p.created_at < $2`,
    [from.toISOString(), to.toISOString()],
  );
  return { posts, matches };
}

/** Insert or update fetched fields. Never touches the saved Gemini labels. */
export async function upsertFetchedPosts(rows: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < rows.length; i += 300) {
    await q(
      `insert into posts (source, post_id, title, snippet, url, created_at, comments, score, answer_count, has_accepted_answer, tags, fetched_at)
       select x.source, x.post_id, x.title, x.snippet, x.url, x.created_at, x.comments, x.score, x.answer_count, x.has_accepted_answer,
              case when x.tags is null or jsonb_typeof(x.tags) <> 'array' then null else array(select jsonb_array_elements_text(x.tags)) end,
              x.fetched_at
         from jsonb_to_recordset($1::jsonb) as x(source text, post_id text, title text, snippet text, url text, created_at timestamptz,
              comments int, score int, answer_count int, has_accepted_answer boolean, tags jsonb, fetched_at timestamptz)
       on conflict (source, post_id) do update set
         title = excluded.title, snippet = excluded.snippet, url = excluded.url, comments = excluded.comments, score = excluded.score,
         answer_count = excluded.answer_count, has_accepted_answer = excluded.has_accepted_answer, tags = excluded.tags, fetched_at = excluded.fetched_at`,
      [json(rows.slice(i, i + 300))],
    );
  }
}

export async function upsertMatches(rows: Array<{ source: string; post_id: string; topic_id: number }>): Promise<void> {
  for (let i = 0; i < rows.length; i += 800) {
    await q(
      `insert into post_matches (source, post_id, topic_id)
       select x.source, x.post_id, x.topic_id
         from jsonb_to_recordset($1::jsonb) as x(source text, post_id text, topic_id bigint)
       on conflict do nothing`,
      [json(rows.slice(i, i + 800))],
    );
  }
}

export async function saveClassifications(posts: PostRow[]): Promise<void> {
  const rows = posts.map((p) => ({ source: p.source, post_id: p.post_id, relevant: p.relevant, sentiment: p.sentiment, pain_point: p.pain_point, seeking_help: p.seeking_help, classified_at: p.classified_at }));
  for (let i = 0; i < rows.length; i += 300) {
    await q(
      `update posts p set relevant = x.relevant, sentiment = x.sentiment, pain_point = x.pain_point, seeking_help = x.seeking_help, classified_at = x.classified_at
         from jsonb_to_recordset($1::jsonb) as x(source text, post_id text, relevant boolean, sentiment text, pain_point text, seeking_help boolean, classified_at timestamptz)
        where p.source = x.source and p.post_id = x.post_id`,
      [json(rows.slice(i, i + 300))],
    );
  }
}

// ---- runs, stats, briefs ----

export interface RunRow {
  id: string;
  run_type: "scheduled" | "manual" | "backfill";
  week_key: string | null;
  anchor: string;
  status: "running" | "sent" | "partial" | "failed";
  attempts: number;
  source_status: import("./health").SourceStatus | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  stage: string | null;
}

export async function getScheduledRun(weekKey: string): Promise<RunRow | null> {
  return (await q<RunRow>("select * from runs where run_type = 'scheduled' and week_key = $1", [weekKey]))[0] ?? null;
}

/** Returns null when another caller created the same scheduled run first. */
export async function insertRun(runType: "scheduled" | "manual", anchor: Date, weekKey: string | null): Promise<RunRow | null> {
  const rows = await q<RunRow>(
    `insert into runs (run_type, week_key, anchor, status, attempts) values ($1, $2, $3, 'running', 1)
     on conflict (week_key) where run_type = 'scheduled' do nothing returning *`,
    [runType, weekKey, anchor.toISOString()],
  );
  return rows[0] ?? null;
}

/** Compare-and-set on attempts so two callers cannot both take the same run. */
export async function claimRun(id: string, attempts: number): Promise<RunRow | null> {
  const rows = await q<RunRow>(
    "update runs set attempts = attempts + 1, status = 'running', started_at = now(), finished_at = null where id = $1 and attempts = $2 returning *",
    [id, attempts],
  );
  return rows[0] ?? null;
}

export async function setSourceStatus(id: string, ss: unknown): Promise<void> {
  await q("update runs set source_status = $2::jsonb where id = $1", [id, json(ss)]);
}

export async function finishRun(id: string, status: string, error: string | null, ss?: unknown): Promise<void> {
  await q(
    "update runs set status = $2, stage = case when $2 = 'failed' then 'failed' else 'done' end, finished_at = now(), error = $3, source_status = coalesce($4::jsonb, source_status) where id = $1",
    [id, status, error, ss === undefined ? null : json(ss)],
  );
}

export async function recentRunSince(since: Date): Promise<string | null> {
  const r = await q<{ started_at: string }>("select started_at from runs where started_at >= $1 and run_type <> 'backfill' order by started_at desc limit 1", [since.toISOString()]);
  return r[0]?.started_at ?? null;
}

export interface BriefRow { run_id: string; content: unknown; html: string | null; email_status: string; email_sent_at: string | null; email_error: string | null }

export async function getBrief(runId: string): Promise<BriefRow | null> {
  return (await q<BriefRow>("select * from briefs where run_id = $1", [runId]))[0] ?? null;
}

export async function insertStats(runId: string, stats: Array<Record<string, unknown>>): Promise<void> {
  await q(
    `insert into weekly_stats (run_id, level, category_id, topic_id, category, keyword, current_count, previous_count, pct_change, trend_label, data_status)
     select $1::uuid, x.level, x.category_id, x.topic_id, x.category, x.keyword, x.current_count, x.previous_count, x.pct_change, x.trend_label, x.data_status
       from jsonb_to_recordset($2::jsonb) as x(level text, category_id bigint, topic_id bigint, category text, keyword text, current_count int, previous_count int, pct_change numeric, trend_label text, data_status text)`,
    [runId, json(stats)],
  );
}

export async function saveBriefAndStats(runId: string, content: unknown, html: string, stats: Array<Record<string, unknown>>): Promise<void> {
  await q("delete from weekly_stats where run_id = $1", [runId]);
  await insertStats(runId, stats);
  await q(
    `insert into briefs (run_id, content, html, email_status) values ($1, $2::jsonb, $3, 'pending')
     on conflict (run_id) do update set content = excluded.content, html = excluded.html, email_status = 'pending', email_sent_at = null, email_error = null`,
    [runId, json(content), html],
  );
}

/** A backfill is recorded as a run of its own type, so its numbers use the same weekly_stats rows as a normal run. */
export async function insertBackfillRun(anchor: Date, status: "sent" | "partial", sourceStatus: unknown): Promise<string> {
  const r = await q<{ id: string }>(
    `insert into runs (run_type, anchor, status, attempts, source_status, stage, finished_at)
     values ('backfill', $1, $2, 1, $3::jsonb, 'done', now()) returning id`,
    [anchor.toISOString(), status, json(sourceStatus)],
  );
  return r[0].id;
}

export async function setEmailStatus(runId: string, ok: boolean, error?: string): Promise<void> {
  if (ok) await q("update briefs set email_status = 'sent', email_sent_at = now(), email_error = null where run_id = $1", [runId]);
  else await q("update briefs set email_status = 'failed', email_error = $2 where run_id = $1", [runId, error ?? "unknown error"]);
}

/** Best effort: the progress panel is nice to have, so a failed stage update must never fail a run. */
export async function setStage(id: string, stage: string): Promise<void> {
  try {
    await q("update runs set stage = $2 where id = $1", [id, stage]);
  } catch {
    /* ignore */
  }
}

export async function latestRunStatus(): Promise<{ id: string; status: string; stage: string | null; started_at: string; finished_at: string | null } | null> {
  const r = await q<{ id: string; status: string; stage: string | null; started_at: string; finished_at: string | null }>(
    "select id, status, stage, started_at, finished_at from runs where run_type <> 'backfill' order by started_at desc limit 1",
  );
  return r[0] ?? null;
}
