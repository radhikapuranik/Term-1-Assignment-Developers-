import { SOURCES, type RequestOutcome, type Source } from "./types";

export interface SourceSummary {
  status: "ok" | "degraded" | "failed";
  requests: number;
  failed: number;
  posts: number;
  retries: number;
  last_error: string | null;
}

export interface SourceStatus {
  sources: Record<Source, SourceSummary>;
  requests: RequestOutcome[];
  stages_ms?: Record<string, number>;
}

export function summarizeSources(outcomes: RequestOutcome[]): SourceStatus {
  const sources = {} as Record<Source, SourceSummary>;
  for (const s of SOURCES) {
    const o = outcomes.filter((x) => x.source === s);
    const failed = o.filter((x) => !x.ok);
    sources[s] = {
      status: failed.length === 0 ? "ok" : failed.length === o.length ? "failed" : "degraded",
      requests: o.length,
      failed: failed.length,
      posts: o.reduce((a, x) => a + x.count, 0),
      retries: o.reduce((a, x) => a + x.retries, 0),
      last_error: failed.length ? (failed[failed.length - 1].error ?? "request failed") : null,
    };
  }
  return { sources, requests: outcomes };
}

export const healthySources = (s: SourceStatus) => SOURCES.filter((k) => s.sources[k].status === "ok").length;
export const allSourcesFailed = (outcomes: RequestOutcome[]) =>
  outcomes.length > 0 && SOURCES.every((s) => !outcomes.some((o) => o.source === s && o.ok));
