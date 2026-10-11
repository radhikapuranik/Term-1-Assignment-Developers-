# PROGRESS

## Done
- Phase 1: project setup, schema + seed, fetchers (HN, Dev.to, Stack Overflow) proven live (39/39 requests ok, 1,005 posts, both windows populated), matching, windows, statistics, trends.
- Phase 2: dashboard + design system (/, /runs/[id], /about, 404, error, loading), builds clean.
- Phase 3: Gemini classification + brief, zod validator with number/percent/URL/direction rules, stats-only fallback.
- Phase 4 (code): Resend email with Idempotency-Key + retries.
- Phase 5 (code): /api/cron/weekly (+catchup), /api/run-now, vercel.json, SIMULATE_FAIL hooks.
- 53 unit tests, typecheck, lint, build all pass.

## In progress
- Checkpoint 1: waiting for keys (Supabase, Gemini, Resend + recipient email, Stack Exchange key).

## Next
1. `npm run check-keys` (tests each key, picks GEMINI_MODEL, saves recipient email).
2. Live pipeline run, real email, idempotency check, 401/passcode/cooldown checks, SIMULATE_FAIL demos.
3. Playwright screenshots (desktop/phone, light/dark; data, empty, partial states) into docs/screenshots/.
4. README, Checkpoint 2 (GitHub + Vercel login), deploy, live Run now, sync Excel, SUBMISSION.md.

## Open questions
- None.
