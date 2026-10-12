import { SOURCES, SOURCE_NAMES } from "./types";
import type { SourceStatus } from "./health";

/** Plain-words reason for a partial or failed run, for the run history. Null for runs that went fine. */
export function runNote(r: { status: string; error: string | null; source_status: SourceStatus | null }): string | null {
  if (r.status !== "partial" && r.status !== "failed") return null;
  const parts: string[] = [];
  const ss = r.source_status?.sources;
  if (ss) {
    for (const s of SOURCES) {
      const x = ss[s];
      if (!x) continue;
      if (x.status === "failed") parts.push(`${SOURCE_NAMES[s]} did not respond`);
      else if (x.status === "degraded") parts.push(`${SOURCE_NAMES[s]} partly failed (${x.failed} of ${x.requests} requests)`);
    }
  }
  const err = r.error ?? "";
  if (/\[brief\/gemini\]/.test(err) && !/dropped AI text/.test(err)) parts.push("the AI summary was unavailable");
  if (/\[classify\//.test(err)) parts.push("AI labelling of posts failed");
  if (/\[email\//.test(err)) parts.push("the email could not be delivered");
  if (r.status === "failed" && parts.length === 0) {
    const m = /\[pipeline\/[^\]]*\]\s*([^|]*)/.exec(err);
    parts.push(m ? `the run stopped: ${m[1].trim().replace(/\.$/, "").slice(0, 110)}` : "the run could not finish");
  }
  if (parts.length === 0) parts.push("some data or steps were unavailable");
  const text = parts.join("; ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}
