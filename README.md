# Developer Community Pulse

A weekly developer-community intelligence digest for a product manager at a code review automation startup. Every Friday at 8:00 AM IST it reads live discussions from Hacker News, Dev.to and Stack Overflow, counts how often each pain point appears this week versus last week, flags potentially unresolved discussions, emails a brief and shows the same brief on a public dashboard.

- Config and history live in Neon Postgres, the Supabase/Neon option allowed by the course stack.
- Built with Next.js (App Router, TypeScript), Neon Postgres, Gemini Flash (the only AI), Resend, Vercel Cron.
- Components Map: `PM_Developer_Assignment_Components_Map.xlsx`.

## How it works

1. Vercel Cron calls `/api/cron/weekly` (Friday 02:30 UTC = 08:00 IST), or the PM presses **Run now** on the dashboard.
2. The function reads the monitored topics and settings from Neon.
3. It fetches posts for both windows in one go (`anchor - 14 days` to `anchor`) from Hacker News (Algolia), Dev.to (by tag) and Stack Overflow (Stack Exchange API), and splits them in code by `created_at`.
4. Code verifies every keyword match (word boundaries, e.g. `CI/CD`), de-duplicates, counts mentions per category and keyword, computes percentage change and trend labels.
5. Gemini Flash labels posts (cached, capped) and writes commentary as JSON that cites post ids only. Code rejects any AI text with a number, percentage or URL, or with a direction word that contradicts the trend label. Every number and link in the output is looked up in the database.
6. The brief is saved, shown on the dashboard and emailed through Resend.

**Code does the maths. Gemini never produces a number or a URL.**

### Windows

One anchor timestamp `A` per run. Current window = `[A - 7d, A)`, previous = `[A - 14d, A - 7d)`. Half-open, so they never overlap and never leave a gap. Scheduled runs use the most recent Friday 02:30 UTC at or before now, so retries and the catch-up job on the same day use identical windows. Manual runs use `A = now`.

### Trend labels (decided in this order)

1. A contributing request failed: "Incomplete data, no trend claimed"
2. Both counts 0: "No mentions (confirmed zero)"
3. `current + previous < min_mentions`: "Insufficient data, no trend claimed"
4. `previous = 0`, `current > 0`: "New, no mentions last week"
5. `current = 0`, `previous > 0`: "Dropped to zero"
6. Otherwise Up / Down / Flat using `flat_threshold_pct`

### Potentially unresolved

Show HN and blog or announcement posts are excluded and every candidate needs a question or complaint signal. Source-specific evidence, always with a reason and link: Stack Overflow questions with no answers (or no accepted or upvoted answer), Hacker News questions or complaints with 0 or 1 comments, Dev.to `help` or `discuss` posts with no comments. Replies are never read, so the app never claims a problem is "unsolved".

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run db:setup               # applies db/schema.sql to your Neon database and checks it
npm run check-keys             # tests each key, picks GEMINI_MODEL, saves the recipient email
npm run dev
```

### Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (pooled) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini API key and model name (`check-keys` picks the newest standard Flash model) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key and sender (`onboarding@resend.dev` until you verify a domain) |
| `CRON_SECRET` | Bearer secret for the cron endpoints (Vercel sends it automatically) |
| `RUN_NOW_PASSCODE` | Passcode for the Run now button |
| `STACKEXCHANGE_KEY` | Raises the Stack Overflow quota from 300 to 10,000 requests a day |
| `APP_URL` | Public URL, used for links in the email |
| `SIMULATE_FAIL` | Optional, demo only: comma list of `hn,devto,se,gemini,email` |

Secrets are never committed or prefixed `NEXT_PUBLIC_`.

## Editing topics (no code change)

Open the Neon console, your project, **Tables** (or **SQL Editor**), table `topics`. Add a row (category, keyword), set `active` to false to switch one off. Settings (`min_mentions`, `flat_threshold_pct`, `devto_tags`, `classify_cap`, `recipient_email`) are rows in `settings`. The next run picks changes up. New keywords get a `created_at` date, so their category is tagged "recently added", and their previous-week baseline is real because both windows are always fetched.

## Endpoints

| Route | Notes |
|---|---|
| `GET /api/cron/weekly` | Scheduled run. Requires `Authorization: Bearer $CRON_SECRET` (constant-time compare, 401 otherwise) |
| `GET /api/cron/weekly?catchup=1` | Exits at once if this week is already `sent`; otherwise resumes the run, or retries only the email |
| `POST /api/run-now` | Manual run. Header `x-run-passcode`. 401 for a wrong passcode, 429 if any run started in the last 5 minutes |

### Scheduling on the Vercel Hobby plan

`vercel.json` has two crons: `30 2 * * 5` (UTC, which is Friday 08:00 IST) and a catch-up at `30 3 * * 5`. On the Hobby plan a cron can fire anywhere within its hour, and Vercel does not retry a failed cron. That is why retries live in the code (up to 3 attempts per week, safe to repeat: one scheduled run per `week_key`, resume from a saved brief, email sent with an `Idempotency-Key`) and why the catch-up job exists. Crons only run on the production deployment.

## Failure handling

- Every outbound request: 8 s timeout, up to 3 retries with exponential backoff on network errors, 429 and 5xx, at most 4 in flight. A request that returned zero posts is a genuine zero; a request that failed is missing data, and its categories show "Incomplete data" with no trend.
- Neon sleeps when idle: the first connection retries a few times with a short delay.
- Gemini: invalid JSON or rule violations are retried twice; if it still fails, a stats-only brief is produced, labelled "AI analysis unavailable this week", and the run is `partial`.
- All sources down: no brief is invented. The run is `failed` and a short failure email is sent.
- Every failure is logged as one JSON line with `console.error` (run id, stage, source, message) and stored on the run row.

## Design and motion

The interface follows one idea, "The Pulse": a hand-drawn pulse line, generated in code from the real statistics, runs across the top of the page and its spikes rise over the categories that are rising. Motion uses GSAP (ScrollTrigger only, loaded after first paint, fully static with "reduce motion"); see `docs/DESIGN.md` for the concept, type pairing (Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono), tokens, motion rules and the measured results.

```bash
npm run a11y-check     # keyboard walkthrough + axe on a running site (default http://localhost:3100)
```

## Tests

```bash
npm run typecheck && npm run lint && npm test
npm run live-check    # fetches the live sources and prints counts, no database needed
node --env-file=.env.local --import tsx scripts/verify-numbers.mts   # page numbers vs the database
```

Unit tests cover the window maths, keyword matcher, de-duplication, trend labels, percent change, unresolved rules, brief assembly and the AI output validator.

## Project layout

```
db/schema.sql          tables and seed data (plain Postgres)
src/lib/               windows, match, stats, trend, sources/*, gemini, classify, brief, validate, render, email, pipeline, db
src/app/               dashboard (/), /runs/[id], /about, API routes
src/components/        dashboard components and SVG charts
scripts/               db-setup, check-keys, live-check
tests/                 vitest unit tests
```

Data credits: Hacker News via Algolia, Dev.to (Forem) API, Stack Exchange API.
