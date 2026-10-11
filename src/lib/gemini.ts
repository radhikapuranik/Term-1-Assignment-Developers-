import type { ZodType } from "zod";
import { sleep } from "./http";
import { simulated } from "./simulate";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const CALL_TIMEOUT_MS = 30000;

export class GeminiError extends Error {}

export function geminiModel(): string {
  const m = process.env.GEMINI_MODEL;
  if (!m) throw new GeminiError("GEMINI_MODEL is not set");
  return m.replace(/^models\//, "");
}

interface CallOptions {
  system: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  /** Epoch ms after which no new attempt is started, so a run stays inside the function time limit. */
  deadlineMs?: number;
}

async function callOnce(o: CallOptions, timeoutMs: number, extraUser?: string): Promise<{ status: number; text: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: "user", parts: [{ text: o.prompt + (extraUser ? `\n\n${extraUser}` : "") }] }],
        generationConfig: {
          temperature: o.temperature,
          responseMimeType: "application/json",
          responseSchema: o.responseSchema,
          thinkingConfig: { thinkingBudget: 0 }, // structured extraction does not need extended thinking, and it is much faster
        },
      }),
    });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Structured JSON call. Retries up to 2 times on invalid JSON, a schema violation, a rule violation
 * reported by `check`, or a 5xx/network error; backs off and retries on 429. Throws GeminiError if
 * no schema-valid answer was ever obtained. Returns the last valid answer and any remaining violations.
 */
export async function geminiJson<T>(
  o: CallOptions & { zod: ZodType<T>; check?: (data: T) => string[] },
): Promise<{ data: T; violations: string[] }> {
  if (simulated("gemini")) throw new GeminiError("simulated failure (SIMULATE_FAIL=gemini)");
  let feedback: string | undefined;
  let lastValid: { data: T; violations: string[] } | null = null;
  let lastError = "no response";
  for (let attempt = 0; attempt <= 2; attempt++) {
    const remaining = o.deadlineMs ? o.deadlineMs - Date.now() : CALL_TIMEOUT_MS;
    if (remaining < 4000) {
      lastError = lastError === "no response" ? "ran out of time before the run limit" : lastError;
      break;
    }
    try {
      const r = await callOnce(o, Math.min(CALL_TIMEOUT_MS, remaining), feedback);
      if (r.status === 404) {
        const msg = `Gemini model not found: "${geminiModel()}". Check GEMINI_MODEL against the models your key can use.`;
        console.error(JSON.stringify({ stage: "gemini", source: "gemini", message: msg }));
        throw new GeminiError(msg);
      }
      if (r.status === 429 || r.status >= 500) {
        lastError = `HTTP ${r.status}`;
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (r.status !== 200) throw new GeminiError(`Gemini HTTP ${r.status}: ${r.text.slice(0, 300)}`);
      const body = JSON.parse(r.text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = o.zod.safeParse(JSON.parse(text));
      if (!parsed.success) {
        lastError = `schema violation: ${parsed.error.message.slice(0, 200)}`;
        feedback = `Your previous answer did not match the required schema (${lastError}). Return valid JSON only.`;
        continue;
      }
      const violations = o.check ? o.check(parsed.data) : [];
      lastValid = { data: parsed.data, violations };
      if (violations.length === 0) return lastValid;
      lastError = `rule violations: ${violations.join("; ").slice(0, 300)}`;
      feedback = `Your previous answer broke these rules, fix them and answer again: ${violations.join("; ")}. Do not write any digits, percentages or URLs in any text.`;
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      lastError = (e as Error).name === "AbortError" ? "timed out" : (e as Error).message;
      if (e instanceof SyntaxError) feedback = "Your previous answer was not valid JSON. Return valid JSON only.";
    }
  }
  if (lastValid) return lastValid;
  throw new GeminiError(`Gemini failed after retries: ${lastError}`);
}

export async function listFlashModels(key: string): Promise<{ all: string[]; flash: string[] }> {
  const res = await fetch(`${BASE}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) throw new GeminiError(`list models failed: HTTP ${res.status}`);
  const body = (await res.json()) as { models: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  const gen = body.models.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
  return { all: gen, flash: gen };
}

/** Newest standard Flash: gemini-<version>-flash, no lite / preview / exp / image / tts / latest suffixes. */
export function pickFlashModel(models: string[]): string | null {
  const standard = models
    .map((m) => ({ m, v: /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(m) }))
    .filter((x): x is { m: string; v: RegExpExecArray } => x.v !== null)
    .sort((a, b) => parseFloat(b.v[1]) - parseFloat(a.v[1]));
  return standard[0]?.m ?? null;
}
