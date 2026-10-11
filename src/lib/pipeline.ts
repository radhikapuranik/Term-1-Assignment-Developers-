import { db, loadConfig, loadWindowData } from "./db";
import { collectPosts } from "./collect";
import { computeStats, verifyMatches } from "./stats";
import { classifyBatch, batches, classificationOrder } from "./classify";
import { assembleBase, evidenceFor, generateCommentary, applyCommentary, type BriefContent } from "./brief";
import { findUnresolved } from "./unresolved";
import { renderEmailHtml, renderText, renderFailureText, emailSubject } from "./render";
import { sendEmail } from "./email";
import { allSourcesFailed, summarizeSources, type SourceStatus } from "./health";
import { GeminiError, geminiModel } from "./gemini";
import { windowsFor } from "./windows";
import { weekEndingLabel } from "./format";
import { postKey, type PostRow, type RequestOutcome, type Settings } from "./types";

export type RunType = "scheduled" | "manual";
export interface PipelineResult {
  status: "sent" | "partial" | "failed" | "skipped";
  runId: string | null;
  message: string;
}

interface RunRow {
  id: string;
  run_type: RunType;
  week_key: string | null;
  anchor: string;
  status: "running" | "sent" | "partial" | "failed";
  attempts: number;
  source_status: SourceStatus | null;
  error: string | null;
  started_at: string;
}

const MAX_ATTEMPTS = 3;
const RUNNING_STALE_MS = 10 * 60 * 1000;
const CLASSIFY_BUDGET_MS = 35_000; // stop starting new Gemini batches after this, so a run fits in 60 s

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function logFailure(runId: string | null, stage: string, source: string, message: string, errors?: string[]) {
  console.error(JSON.stringify({ level: "error", run_id: runId, stage, source, message }));
  errors?.push(`[${stage}/${source}] ${message}`);
}

async function guard(anchor: Date, runType: RunType): Promise<{ skip: PipelineResult } | { run: RunRow }> {
  const sb = db();
  if (runType === "manual") {
    const ins = await sb.from("runs").insert({ run_type: "manual", anchor: anchor.toISOString(), status: "running", attempts: 1 }).select("*").single();
    if (ins.error) throw new Error(`could not create run: ${ins.error.message}`);
    return { run: ins.data as RunRow };
  }
  const weekKey = anchor.toISOString();
  const ex = await sb.from("runs").select("*").eq("week_key", weekKey).eq("run_type", "scheduled").maybeSingle();
  if (ex.error) throw new Error(`could not read runs: ${ex.error.message}`);
  const row = ex.data as RunRow | null;
  if (row) {
    if (row.status === "sent") return { skip: { status: "skipped", runId: row.id, message: "already sent" } };
    if (row.status === "running" && Date.now() - new Date(row.started_at).getTime() < RUNNING_STALE_MS)
      return { skip: { status: "skipped", runId: row.id, message: "a run for this week is already in progress" } };
    if (row.attempts >= MAX_ATTEMPTS)
      return { skip: { status: "skipped", runId: row.id, message: `maximum of ${MAX_ATTEMPTS} attempts reached` } };
    const upd = await sb
      .from("runs")
      .update({ attempts: row.attempts + 1, status: "running", started_at: new Date().toISOString(), finished_at: null })
      .eq("id", row.id)
      .eq("attempts", row.attempts) // compare-and-set so two callers cannot both take the run
      .select("*");
    if (upd.error) throw new Error(upd.error.message);
    if (!upd.data?.length) return { skip: { status: "skipped", runId: row.id, message: "another caller took this run" } };
    return { run: upd.data[0] as RunRow };
  }
  const ins = await sb.from("runs").insert({ run_type: "scheduled", week_key: weekKey, anchor: weekKey, status: "running", attempts: 1 }).select("*").single();
  if (ins.error) return { skip: { status: "skipped", runId: null, message: `another caller created this run (${ins.error.message})` } };
  return { run: ins.data as RunRow };
}

async function finish(run: RunRow, status: "sent" | "partial" | "failed", errors: string[], sourceStatus?: SourceStatus) {
  const patch: Record<string, unknown> = { status, finished_at: new Date().toISOString(), error: errors.length ? errors.join(" | ").slice(0, 4000) : null };
  if (sourceStatus) patch.source_status = sourceStatus;
  const { error } = await db().from("runs").update(patch).eq("id", run.id);
  if (error) console.error(JSON.stringify({ level: "error", run_id: run.id, stage: "finish", source: "supabase", message: error.message }));
}

const idempotencyKey = (run: RunRow) => (run.week_key ? `weekly-brief-${run.week_key}` : run.id);

async function deliver(run: RunRow, content: BriefContent, html: string, settings: Pick<Settings, "recipient_email">, errors: string[]): Promise<boolean> {
  const r = await sendEmail({
    to: settings.recipient_email,
    subject: emailSubject(content.anchor),
    html,
    text: renderText(content, appUrl()),
    idempotencyKey: idempotencyKey(run),
  });
  const patch = r.ok
    ? { email_status: "sent", email_sent_at: new Date().toISOString(), email_error: null }
    : { email_status: "failed", email_error: r.error ?? "unknown error" };
  await db().from("briefs").update(patch).eq("run_id", run.id);
  if (!r.ok) logFailure(run.id, "email", "resend", r.error ?? "unknown error", errors);
  return r.ok;
}

function overallStatus(content: BriefContent, outcomes: RequestOutcome[], emailOk: boolean): "sent" | "partial" {
  return emailOk && content.ai.status === "ok" && outcomes.every((o) => o.ok) ? "sent" : "partial";
}

/**
 * One function for the whole weekly job. Scheduled runs are guarded (one per week_key, max 3 attempts,
 * resume from a saved brief); manual runs always create a new row with anchor = now.
 */
export async function runPipeline(anchor: Date, runType: RunType, opts: { catchup?: boolean } = {}): Promise<PipelineResult> {
  const started = Date.now();
  const errors: string[] = [];
  const stagesMs: Record<string, number> = {};
  const stage = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      stagesMs[name] = Date.now() - t;
      console.log(JSON.stringify({ level: "info", stage: name, ms: stagesMs[name] }));
    }
  };

  let run: RunRow | null = null;
  try {
    const g = await stage("guard", () => guard(anchor, runType));
    if ("skip" in g) return g.skip;
    run = g.run;
    const sb = db();
    console.log(JSON.stringify({ level: "info", run_id: run.id, stage: "start", run_type: runType, attempt: run.attempts, catchup: !!opts.catchup }));

    // Resume: a brief already exists, so only the email may still be missing.
    const existing = await sb.from("briefs").select("*").eq("run_id", run.id).maybeSingle();
    if (existing.data) {
      const content = existing.data.content as BriefContent;
      const { settings } = await loadConfig().catch(() => ({ settings: null }));
      const outcomes = run.source_status?.requests ?? [];
      let emailOk = existing.data.email_status === "sent";
      if (!emailOk) {
        if (!settings) throw new Error("could not load settings to retry the email");
        emailOk = await stage("email-retry", () => deliver(run!, content, (existing.data!.html as string) ?? renderEmailHtml(content, appUrl(), `/runs/${run!.id}`), settings, errors));
      }
      const status = overallStatus(content, outcomes, emailOk);
      await finish(run, status, errors, run.source_status ?? undefined);
      return { status, runId: run.id, message: emailOk ? "resumed: email delivered" : "resumed: email still failing" };
    }

    const { topics, settings } = await stage("config", () => loadConfig());
    if (topics.length === 0) throw new Error("No active topics in the topics table. Switch at least one keyword on (active = true).");
    const w = windowsFor(anchor);

    // Fetch both windows in one go.
    const { posts: fetched, outcomes } = await stage("fetch", () => collectPosts(topics, settings, w.fetchFrom, anchor));
    const sourceStatus: SourceStatus = { ...summarizeSources(outcomes), stages_ms: stagesMs };
    for (const o of outcomes.filter((x) => !x.ok)) logFailure(run.id, "fetch", o.source, `${o.target}: ${o.error}`, errors);

    if (allSourcesFailed(outcomes)) {
      const reason = errors.slice(0, 5).join("; ") || "every request failed";
      const mail = await sendEmail({
        to: settings.recipient_email,
        subject: `Developer Community Pulse: data collection failed, week ending ${weekEndingLabel(anchor)} IST`,
        html: `<p style="font-family:sans-serif">${renderFailureText(reason, appUrl()).replace(/\n/g, "<br>")}</p>`,
        text: renderFailureText(reason, appUrl()),
        idempotencyKey: `${idempotencyKey(run)}-failed-${run.attempts}`,
      });
      if (!mail.ok) logFailure(run.id, "email", "resend", mail.error ?? "failed to send the failure notice", errors);
      await finish(run, "failed", errors, sourceStatus);
      return { status: "failed", runId: run.id, message: "all sources failed; no brief produced" };
    }
    await sb.from("runs").update({ source_status: sourceStatus }).eq("id", run.id);

    // Verify matches in code, then store only posts that really match an active keyword.
    const matches = verifyMatches(fetched, topics);
    const matchedKeys = new Set(matches.map((m) => postKey(m.source, m.post_id)));
    const now = new Date();
    await stage("save-posts", async () => {
      const rows = fetched
        .filter((p) => matchedKeys.has(postKey(p.source, p.post_id)))
        .map((p) => ({ ...p, fetched_at: now.toISOString() }));
      for (let i = 0; i < rows.length; i += 400) {
        const { error } = await sb.from("posts").upsert(rows.slice(i, i + 400), { onConflict: "source,post_id" });
        if (error) throw new Error(`posts upsert: ${error.message}`);
      }
      for (let i = 0; i < matches.length; i += 800) {
        const { error } = await sb.from("post_matches").upsert(matches.slice(i, i + 800), { onConflict: "source,post_id,category,keyword" });
        if (error) throw new Error(`post_matches upsert: ${error.message}`);
      }
    });

    // Statistics come from the database, restricted to active pairs and to each window by created_at.
    const { posts, matches: dbMatches } = await stage("load", () => loadWindowData(w.fetchFrom, anchor));
    const stats = computeStats({ matches: dbMatches, activeTopics: topics, windows: w, settings, outcomes });
    const activeSet = new Set(topics.map((t) => `${t.category}\u0000${t.keyword}`));
    const activeKeys = new Set(dbMatches.filter((m) => activeSet.has(`${m.category}\u0000${m.keyword}`)).map((m) => postKey(m.source, m.post_id)));
    const inScope = posts.filter((p) => activeKeys.has(postKey(p.source, p.post_id)));

    // Classify with Gemini (cached, capped, time-budgeted).
    let classifyFailed = 0;
    let classifyOk = 0;
    await stage("classify", async () => {
      const todo = classificationOrder(inScope.filter((p) => !p.classified_at)).slice(0, settings.classify_cap);
      const groups = batches(todo);
      const byKey = new Map(posts.map((p) => [postKey(p.source, p.post_id), p]));
      for (let i = 0; i < groups.length; i += 2) {
        if (Date.now() - started > CLASSIFY_BUDGET_MS) break;
        const results = await Promise.allSettled(groups.slice(i, i + 2).map((g) => classifyBatch(g)));
        const updated: PostRow[] = [];
        for (const r of results) {
          if (r.status === "rejected") {
            classifyFailed++;
            logFailure(run!.id, "classify", "gemini", (r.reason as Error).message, errors);
            continue;
          }
          classifyOk++;
          for (const [id, c] of r.value) {
            const p = byKey.get(id);
            if (!p) continue;
            Object.assign(p, { relevant: c.relevant, sentiment: c.sentiment, pain_point: c.pain_point, seeking_help: c.seeking_help, classified_at: new Date().toISOString() });
            updated.push(p);
          }
        }
        if (updated.length) {
          const { error } = await sb.from("posts").upsert(updated, { onConflict: "source,post_id" });
          if (error) logFailure(run!.id, "classify", "supabase", error.message, errors);
        }
      }
    });

    // Build the brief: code-calculated base first, then AI commentary if Gemini is available.
    const unresolved = findUnresolved(inScope.filter((p) => new Date(p.created_at).getTime() >= w.current.from.getTime()));
    const classified = inScope.filter((p) => p.classified_at).length;
    let content = assembleBase({
      anchor, now, topics, stats: stats.rows, totals: stats.totals, posts: inScope, matches: dbMatches,
      unresolved, outcomes, currentFrom: w.current.from, classified, unclassified: inScope.length - classified,
    });
    await stage("brief", async () => {
      if (classifyOk === 0 && classifyFailed > 0) {
        content.ai.reason = "Gemini could not be reached";
        return;
      }
      try {
        const evidence = new Map(content.categories.map((c) => [c.category, evidenceFor(c.category, inScope, dbMatches, w.current.from, anchor, 8)]));
        const checked = await generateCommentary(content, evidence, unresolved);
        content = applyCommentary(content, checked, inScope);
        if (checked.violations.length) logFailure(run!.id, "brief", "gemini", `dropped AI text after retries: ${checked.violations.join("; ").slice(0, 500)}`, errors);
      } catch (e) {
        const msg = e instanceof GeminiError ? e.message : (e as Error).message;
        content.ai.reason = msg;
        logFailure(run!.id, "brief", "gemini", msg, errors);
      }
    });
    if (content.ai.status === "unavailable") content.ai.model = (() => { try { return geminiModel(); } catch { return null; } })();

    const html = renderEmailHtml(content, appUrl(), `/runs/${run.id}`);
    await stage("save-brief", async () => {
      await sb.from("weekly_stats").delete().eq("run_id", run!.id);
      const { error: e1 } = await sb.from("weekly_stats").insert(stats.rows.map((r) => ({ ...r, run_id: run!.id })));
      if (e1) throw new Error(`weekly_stats: ${e1.message}`);
      const { error: e2 } = await sb.from("briefs").upsert({ run_id: run!.id, content, html, email_status: "pending" }, { onConflict: "run_id" });
      if (e2) throw new Error(`briefs: ${e2.message}`);
    });

    const emailOk = await stage("email", () => deliver(run!, content, html, settings, errors));
    const status = overallStatus(content, outcomes, emailOk);
    sourceStatus.stages_ms = stagesMs;
    await finish(run, status, errors, sourceStatus);
    console.log(JSON.stringify({ level: "info", run_id: run.id, stage: "done", status, total_ms: Date.now() - started }));
    return { status, runId: run.id, message: `brief saved; email ${emailOk ? "sent" : "failed"}; AI ${content.ai.status}` };
  } catch (e) {
    const msg = (e as Error).message;
    logFailure(run?.id ?? null, "pipeline", "code", msg, errors);
    if (run) await finish(run, "failed", errors);
    return { status: "failed", runId: run?.id ?? null, message: msg };
  }
}
