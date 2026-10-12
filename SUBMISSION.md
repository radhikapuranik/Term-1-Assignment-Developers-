# Submission: Developer Community Pulse

- **Live URL:** https://developer-community-pulse.vercel.app
- **GitHub repo:** https://github.com/radhikapuranik/Term-1-Assignment-Developers-
- **Components Map:** `PM_Developer_Assignment_Components_Map.xlsx` (in the repo)
- **Screenshots:** `docs/screenshots/` (dashboard with data, empty state and partial-failure state; desktop and phone, light and dark)

## Design in two sentences

The dashboard is built around one idea, "The Pulse": a hand-drawn pulse line generated from the real statistics runs across the top of the page, with spikes over the categories that are rising, plus a "This week in 10 seconds" block for a reader with ten seconds. Motion is made with GSAP (ScrollTrigger, loaded after the page is visible, and fully static for people who prefer reduced motion); the full concept, measurements and screenshots are in `docs/DESIGN.md` and `docs/screenshots/`.

## Where the Run now passcode is

In the file `.env.local` in the project folder, on the line `RUN_NOW_PASSCODE=`. (Mac Finder hides files that start with a dot: press Cmd+Shift+. to see it.) The same value is stored as an environment variable on Vercel. The passcode is never in the code or in the browser.

## How Sumit adds a keyword (no code change, no Neon needed)

1. Open the live site and click **Topics** in the top bar (or go to `/topics`).
2. Enter the Run now passcode and press **Unlock**.
3. Under the category you want, type the keyword and press **Add keyword**. A short message confirms it, with this week and last week numbers: the last 14 days are backfilled straight away from the three sources (no AI used).
4. To rename, move or switch things on or off, use the buttons on the same page. Nothing is ever deleted; switching off keeps past numbers.

Topics are stored in Neon Postgres. Settings such as the minimum mentions, Dev.to tags and recipient email are still rows in the `settings` table in the Neon console (Tables).

## 60-second demo script

1. **(0:00)** Open the live URL. "This is a weekly brief that reads Hacker News, Dev.to and Stack Overflow live. Everything on the page comes from a real run."
2. **(0:10)** Point at the summary strip. "Two windows, written out in words: this week versus the 7 days before. Unique posts, categories rising, potentially unresolved discussions, sources healthy."
3. **(0:20)** Pain points table. "Counts per category, this week versus last week, with a trend chip. Rising is orange, falling is green. Small counts say 'Too little data', they never invent a trend." Click a row to show its keywords and evidence links.
4. **(0:35)** Keyword watchlist. "This answers the PM's question: did 'false positive' appear 4 times or 14? Exact counts per keyword."
5. **(0:42)** Potentially unresolved. "Each item has the reason and a link to verify. We never say 'unsolved', only 'potentially unresolved'."
6. **(0:50)** Click **Run now**, enter the passcode, press Start run. "It is protected by a passcode and a 5-minute cooldown. A full run with a brand-new week takes under a minute." (When it finishes, the page refreshes and an email arrives.)
7. **(0:58)** Open the Topics page. "Sumit manages topics here, behind the passcode. A new keyword is backfilled for 14 days and shows a trend straight away."

## Known limits

- **Cron timing on the free plan:** the Vercel Hobby plan may start a cron anywhere inside its hour, so the 8:00 AM IST email can arrive up to an hour late. Vercel does not retry a failed cron, so the code retries (up to 3 attempts per week) and a catch-up job runs at 9:00 AM IST.
- **Email recipient:** until a domain is verified in Resend, mail goes out from `onboarding@resend.dev` and can only be delivered to the account owner's own address.
- **API quotas:** Stack Exchange allows 10,000 requests a day with the key (300 without). Gemini free tier limits apply. Dev.to and Hacker News need no key.
- **Search is keyword-based:** posts are counted when a keyword appears in the title or the first part of the text, so a post that discusses a topic in other words is not counted.
- **Thin evidence:** a category backed by only 1 or 2 posts this week is labelled "thin evidence". A post can count in more than one category, so category totals can exceed "unique posts".
- **"Potentially unresolved" means** the source showed few or no replies at the time we looked (never Show HN or blog or announcement posts, and always with a question or complaint signal; Stack Overflow: no answers, or no accepted or upvoted answer; Hacker News: a question or complaint with 0 or 1 comments; Dev.to: a help or discussion post with no comments). It does **not** mean the problem is unsolved: replies are never read, answers can arrive later, and each item shows the fetch date and a link to verify.
- **Run time:** a run must fit in 60 seconds. A first run with nothing cached takes about 55 seconds (Gemini labels new posts, capped at 120 per run). Later runs reuse the saved labels and take about 15 seconds.
- **Trends are comparisons of counts, not proof of cause.** Small counts get no trend label on purpose.

## What I did differently from the prompt

- **Neon Postgres** (the Supabase/Neon option allowed by the course stack; config and history live there): `@neondatabase/serverless` with `DATABASE_URL`, schema in `db/schema.sql`, no Row Level Security (the app connects only from the server). `npm run db:setup` applies it. The setup-only variable `RECIPIENT_EMAIL` is used by `npm run check-keys` to save the recipient into the `settings` table.
- **Gemini model:** `gemini-3.8-flash`, picked automatically as the newest standard Flash model that supports `generateContent`. Extended "thinking" is switched off for both calls: it made structured JSON calls 2 to 3 times slower and a run would not fit in 60 seconds.
- **Stack Overflow answered flag:** `posts.has_accepted_answer` stores Stack Exchange's `is_answered` (an accepted or upvoted answer exists), which is what the "no accepted answer and no answers marked answered" rule needs.
- **Matching:** every fetched post is checked against every active keyword in code (not only the keyword it was fetched for), and only posts that match at least one active keyword are stored.
- **Direction words:** the AI-text check blocks words that describe discussion volume (rising, increasing, falling, declining and similar) when they contradict the trend label. Ordinary words such as "dropped" in a pain-point description are allowed.
- **Run time guard:** Gemini calls stop starting new attempts at 54 seconds so a run always finishes, saves and emails inside the 60-second limit.
- **Empty-state screenshots** were taken from the real app by temporarily swapping in empty `runs` and `briefs` tables, then restoring the originals.
- **Verification emails:** testing sent several real emails to the recipient (live runs, failure simulations and one idempotency test).

## Verification results (design upgrade)

- Live Lighthouse, mobile: Performance 97 to 99, Accessibility 100, Best Practices 100, SEO 100, LCP 2.0 to 2.5 s, no layout shift. Desktop: 100 on all four.
- Keyboard-only walkthrough and axe (contrast included): all pass, 0 violations, light and dark, desktop and phone.
- The page works with JavaScript off, with reduced motion and on a slow network. After a fresh real run, every number on the page matches the database.

## Verification results (pipeline)

- 53 unit tests, typecheck, lint and production build pass.
- Live run: 1,005 unique posts fetched from 39 requests across the three sources; both windows contain data on the first run.
- Cron endpoint: 401 without the secret, success with it (also on the live site). Run now: 401 for a wrong passcode, 429 with the seconds remaining during the cooldown.
- `SIMULATE_FAIL=hn`: all categories marked "Incomplete data, no trend claimed", run `partial`, banner shown. `SIMULATE_FAIL=gemini`: stats-only brief labelled "AI analysis unavailable this week", run `partial`. `SIMULATE_FAIL=email`: brief saved, run `partial`; the catch-up job then retried only the email and the run became `sent`; calling catch-up or the primary cron again returned "already sent".
- Sending the same email twice with one Idempotency-Key returned the same Resend id (no duplicate).
- Two cron jobs appear on the production deployment (`30 2 * * 5` and `30 3 * * 5` with `?catchup=1`).

## Why Gemini Flash for the AI, and why is counting done in code?

"The assignment requires Gemini Flash, and it also suits this job: the AI work is short and structured (label a post, write a few sentences from evidence), so a fast, low-cost model in JSON mode is enough, and it keeps a weekly run inside a 60-second serverless limit. Counting is done in code because counts, percentage changes, trend labels and links must be correct and repeatable. A language model can miscount, round or invent a number or a URL, and a product manager will make decisions from these numbers. So code calculates every figure from the database and looks up every link, while Gemini only labels posts and writes commentary that cites post ids. Our code rejects any AI text containing a number, percentage or URL, or a direction that contradicts the calculated trend, so the AI cannot change a figure even by accident."
