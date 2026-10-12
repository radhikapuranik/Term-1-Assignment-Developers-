import {
  claimRun, finishRun, getBrief, getScheduledRun, insertRun, loadConfig, loadWindowData, saveBriefAndStats,
  saveClassifications, setEmailStatus, setSourceStatus, setStage, upsertFetchedPosts, upsertMatches, type RunRow,
} from "./db";
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

const MAX_ATTEMPTS = 3;
const RUNNING_STALE_MS = 10 * 60 * 1000;
const CLASSIFY_PARALLEL = 4;
const RUN_DEADLINE_MS = 54_000; // Gemini attempts stop starting after this, leaving time to save and email
const CLASSIFY_BUDGET_MS = 30_000; // stop starting new Gemini batches after this, so a run fits in 60 s

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function logFailure(runId: string | null, stage: string, source: string, message: string, errors?: string[]) {
  console.error(JSON.stringify({ level: "error", run_id: runId, stage, source, message }));
  errors?.push(`[${stage}/${source}] ${message}`);
}

async function guard(anchor: Date, runType: RunType): Promise<{ skip: PipelineResult } | { run: RunRow }> {
  if (runType === "manual") {
    const run = await insertRun("manual", anchor, null);
    if (!run) throw new Error("could not create run");
    return { run };
  }
  const weekKey = anchor.toISOString();
  const row = await getScheduledRun(weekKey);
  if (row) {
    if (row.status === "sent") return { skip: { status: "skipped", runId: row.id, message: "already sent" } };
    if (row.status === "running" && Date.now() - new Date(row.started_at).getTime() < RUNNING_STALE_MS)
      return { skip: { status: "skipped", runId: row.id, message: "a run for this week is already in progress" } };
    if (row.attempts >= MAX_ATTEMPTS)
      return { skip: { status: "skipped", runId: row.id, message: `maximum of ${MAX_ATTEMPTS} attempts reached` } };
    const claimed = await claimRun(row.id, row.attempts);
    if (!claimed) return { skip: { status: "skipped", runId: row.id, message: "another caller took this run" } };
    return { run: claimed };
  }
  const created = await insertRun("scheduled", anchor, weekKey);
  if (!created) return { skip: { status: "skipped", runId: null, message: "another caller created this run first" } };
  return { run: created };
}

async function finish(run: RunRow, status: "sent" | "partial" | "failed", errors: string[], sourceStatus?: SourceStatus) {
  try {
    await finishRun(run.id, status, errors.length ? errors.join(" | ").slice(0, 4000) : null, sourceStatus);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", run_id: run.id, stage: "finish", source: "neon", message: (e as Error).message }));
  }
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
  await setEmailStatus(run.id, r.ok, r.error);
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
    await setStage(run.id, "fetch");
    console.log(JSON.stringify({ level: "info", run_id: run.id, stage: "start", run_type: runType, attempt: run.attempts, catchup: !!opts.catchup }));

    // Resume: a brief already exists, so only the email may still be missing.
    const existing = await getBrief(run.id);
    if (existing) {
      const content = existing.content as BriefContent;
      const { settings } = await loadConfig().catch(() => ({ settings: null }));
      const outcomes = run.source_status?.requests ?? [];
      let emailOk = existing.email_status === "sent";
      if (!emailOk) {
        if (!settings) throw new Error("could not load settings to retry the email");
        emailOk = await stage("email-retry", () => deliver(run!, content, existing.html ?? renderEmailHtml(content, appUrl(), `/runs/${run!.id}`), settings, errors));
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
    await setSourceStatus(run.id, sourceStatus);

    // Verify matches in code, then store only posts that really match an active keyword.
    const matches = verifyMatches(fetched, topics);
    const matchedKeys = new Set(matches.map((m) => postKey(m.source, m.post_id)));
    const now = new Date();
    await stage("save-posts", async () => {
      const rows = fetched
        .filter((p) => matchedKeys.has(postKey(p.source, p.post_id)))
        .map((p) => ({ ...p, fetched_at: now.toISOString() }));
      await upsertFetchedPosts(rows);
      await upsertMatches(matches);
    });

    await setStage(run.id, "count");
    // Statistics come from the database, restricted to active pairs and to each window by created_at.
    const { posts, matches: dbMatches } = await stage("load", () => loadWindowData(w.fetchFrom, anchor));
    const stats = computeStats({ matches: dbMatches, activeTopics: topics, windows: w, settings, outcomes });
    const activeIds = new Set(topics.map((t) => t.id));
    const activeKeys = new Set(dbMatches.filter((m) => activeIds.has(m.topic_id)).map((m) => postKey(m.source, m.post_id)));
    const inScope = posts.filter((p) => activeKeys.has(postKey(p.source, p.post_id)));

    await setStage(run.id, "analyse");
    // Classify with Gemini (cached, capped, time-budgeted).
    let classifyFailed = 0;
    let classifyOk = 0;
    await stage("classify", async () => {
      const todo = classificationOrder(inScope.filter((p) => !p.classified_at)).slice(0, settings.classify_cap);
      const groups = batches(todo);
      const byKey = new Map(posts.map((p) => [postKey(p.source, p.post_id), p]));
      for (let i = 0; i < groups.length; i += CLASSIFY_PARALLEL) {
        if (Date.now() - started > CLASSIFY_BUDGET_MS) break;
        const results = await Promise.allSettled(groups.slice(i, i + CLASSIFY_PARALLEL).map((g) => classifyBatch(g)));
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
          try {
            await saveClassifications(updated);
          } catch (e) {
            logFailure(run!.id, "classify", "neon", (e as Error).message, errors);
          }
        }
      }
    });

    await setStage(run.id, "write");
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
        const evidence = new Map(content.categories.map((c) => [c.category, evidenceFor(new Set(topics.filter((t) => t.category_id === c.category_id).map((t) => t.id)), inScope, dbMatches, w.current.from, anchor, 8)]));
        const checked = await generateCommentary(content, evidence, unresolved, started + RUN_DEADLINE_MS);
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
    await stage("save-brief", () => saveBriefAndStats(run!.id, content, html, stats.rows as unknown as Array<Record<string, unknown>>));

    await setStage(run.id, "email");
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
