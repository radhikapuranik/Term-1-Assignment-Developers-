import { sleep } from "./http";
import { simulated } from "./simulate";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends through Resend's REST API. The Idempotency-Key header means a retry (or a second call with
 * the same key) cannot create a duplicate email. Up to 3 retries with backoff on network errors, 429 and 5xx.
 */
export async function sendEmail(args: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult> {
  if (simulated("email")) return { ok: false, error: "simulated failure (SIMULATE_FAIL=email)" };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "RESEND_API_KEY or EMAIL_FROM is not set" };
  if (!args.to || args.to.includes("example.com")) return { ok: false, error: "recipient_email in the settings table has not been set" };
  let lastError = "unknown error";
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1));
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": args.idempotencyKey },
        body: JSON.stringify({ from, to: [args.to], subject: args.subject, html: args.html, text: args.text }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && body.id) return { ok: true, id: body.id };
      lastError = `Resend HTTP ${res.status}: ${body.message ?? "no message"}`;
      if (res.status !== 429 && res.status < 500) break; // permanent error, retrying will not help
    } catch (e) {
      lastError = `network error: ${(e as Error).message}`;
    }
  }
  return { ok: false, error: lastError };
}
