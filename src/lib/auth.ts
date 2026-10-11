import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (both sides are hashed first so the lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function bearerOk(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const m = /^Bearer (.+)$/.exec(header ?? "");
  return !!m && safeEqual(m[1], secret);
}
