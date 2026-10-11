const TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const MAX_IN_FLIGHT = 4;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let inFlight = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

/** Runs `fn` while holding one of the 4 shared request slots. */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export interface JsonResult<T> {
  ok: boolean;
  data?: T;
  retries: number;
  error?: string;
}

/**
 * GET JSON with an 8 second timeout and up to 3 retries (exponential backoff) on network
 * errors, 429 and 5xx. At most 4 requests are in flight across the whole process.
 */
export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; backoffBaseMs?: number } = {},
): Promise<JsonResult<T>> {
  const base = opts.backoffBaseMs ?? 400;
  let retries = 0;
  let lastError = "unknown error";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      retries++;
      await sleep(base * 2 ** (attempt - 1));
    }
    let retryable = false;
    try {
      const res = await withSlot(async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "developer-community-pulse/1.0", ...opts.headers },
            signal: ctrl.signal,
            cache: "no-store",
          });
          const text = await r.text();
          return { status: r.status, text };
        } finally {
          clearTimeout(timer);
        }
      });
      if (res.status >= 200 && res.status < 300) {
        try {
          return { ok: true, data: JSON.parse(res.text) as T, retries };
        } catch {
          lastError = "response was not valid JSON";
          retryable = true;
        }
      } else {
        lastError = `HTTP ${res.status}`;
        retryable = res.status === 429 || res.status >= 500;
      }
    } catch (e) {
      const err = e as Error;
      lastError = err.name === "AbortError" ? "timed out after 8 seconds" : `network error: ${err.message}`;
      retryable = true;
    }
    if (!retryable) break;
  }
  return { ok: false, retries, error: lastError };
}
