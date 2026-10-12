import type { Metadata } from "next";
import { loadDashboard } from "@/lib/dashboard-data";
import { SimpleNav } from "@/components/SimpleNav";

export const revalidate = 300;
export const metadata: Metadata = { title: "How it works", description: "How Developer Community Pulse collects discussions and counts pain points." };

export default async function About() {
  const data = await loadDashboard();
  const cats = [...new Set(data.topics.map((t) => t.category))];
  const min = data.settings?.min_mentions ?? 5;
  const flat = data.settings?.flat_threshold_pct ?? 10;
  return (
    <>
      <SimpleNav />
      <main id="main" className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <p className="eyebrow">Methodology</p>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(40px, 7vw, 84px)", letterSpacing: "-.04em", lineHeight: 0.95, margin: "16px 0 12px" }}>How it works</h1>
        <p className="muted measure" style={{ marginBottom: 8 }}>How the numbers are counted, in plain language.</p>
        <div className="prose" style={{ marginTop: 24 }}>
        <h2>What this is</h2>
        <p>Every Friday at 8:00 AM IST this app reads public developer discussions, counts how often each pain point comes up this week versus last week, and sends the brief by email. The same brief is shown on the dashboard.</p>

        <h2>Where the data comes from</h2>
        <ul>
          <li><strong>Hacker News</strong>: stories that contain a monitored phrase (search by Algolia).</li>
          <li><strong>Dev.to</strong>: articles from a list of tags, filtered for the monitored keywords by our code.</li>
          <li><strong>Stack Overflow</strong>: questions that contain a monitored phrase (Stack Exchange API).</li>
        </ul>
        <p>All data is fetched live on every run. Nothing is sample data.</p>

        <h2>The two weeks being compared</h2>
        <p>Each run has one anchor time. This week is the 7 days before the anchor. Last week is the 7 days before that. The two windows touch but never overlap and never leave a gap. A post belongs to a week by when it was created at the source, not by when we fetched it. Scheduled runs use Friday 8:00 AM IST as the anchor, so a retry the same day uses identical windows. A manual Run now uses the current time. We fetch both weeks in one go, so last week is always available, even on the first run.</p>

        <h2>How mentions are counted</h2>
        <ul>
          <li>The sources search loosely, so our code re-checks every post: the keyword must really appear in the title or the first part of the text, as a whole word or phrase.</li>
          <li>A mention is one unique post. If a post matches two keywords in the same category, it counts once for that category.</li>
          <li>If a post matches two different categories, it counts once in each. The overall total counts every post once.</li>
          <li>The keyword table counts unique posts per keyword the same way.</li>
          <li>Because a post can count in more than one category, category totals can add up to more than &ldquo;unique posts&rdquo;. Dev.to is fetched by tag and filtered by keyword in code.</li>
          <li>A category backed by only 1 or 2 posts this week is marked &ldquo;thin evidence&rdquo;.</li>
        </ul>

        <h2>Trends</h2>
        <p>Change is (this week minus last week) divided by last week, shown only when last week had at least one mention. Labels are decided in this order:</p>
        <ol>
          <li><strong>Incomplete data</strong>: a request that feeds the number failed, so we claim no trend.</li>
          <li><strong>No mentions (confirmed zero)</strong>: zero both weeks and every source responded.</li>
          <li><strong>Insufficient data</strong>: fewer than <code>{min}</code> mentions across both weeks.</li>
          <li><strong>New</strong>: none last week, some this week (no percentage shown).</li>
          <li><strong>Dropped to zero</strong>: some last week, none this week.</li>
          <li><strong>Up, Down or Flat</strong>: Flat means within <code>{flat}%</code> either way.</li>
        </ol>
        <p>A request that worked but found nothing is a genuine zero. A request that failed is missing data. We never confuse the two.</p>

        <h2>What the AI does, and does not do</h2>
        <p>Gemini Flash is the only AI used. It labels posts (relevant, sentiment, a short pain point, whether the author asks for help) and writes the summary text from numbers and posts that the code gives it. It never produces a number or a link. Our code rejects any AI text that contains a digit, a percentage or a URL, or that contradicts the trend label. Every number, trend and link on the page is looked up in the database. If the AI is unavailable, the brief is sent with the counts only and says so.</p>

        <h2>&ldquo;Potentially unresolved&rdquo;</h2>
        <p>We never flag Show HN or blog and announcement posts, and a post needs a question or complaint signal (a Stack Overflow post is a question by nature). We flag a discussion when the source shows few replies at the time we looked: a Stack Overflow question with no answers or no accepted or upvoted answer, a Hacker News question or complaint with at most one comment, or a Dev.to help or discussion post with no comments. We do not read the replies, so we never claim a problem is unsolved. Answers may arrive later, so each item shows the fetch date and a link to verify.</p>

        <h2>Monitored topics</h2>
        <p>Config and history live in Neon Postgres, the Supabase/Neon option allowed by the course stack. Topics are managed on the Topics page (/topics, behind the Run now passcode) and stored in Neon Postgres, with no code change. New keywords are backfilled for 14 days, so their trend shows right away (labelled &ldquo;backfilled&rdquo;).</p>
        {cats.length === 0 ? <p className="muted">No active topics.</p> : (
          <ul>{cats.map((c) => <li key={c}><strong>{c}</strong>: {data.topics.filter((t) => t.category === c).map((t) => t.keyword).join(", ")}</li>)}</ul>
        )}

        <h2>Schedule and limits</h2>
        <p>The brief is scheduled for Friday 8:00 AM IST. On the free Vercel plan the job may start anywhere within that hour, and a catch-up job runs an hour later to finish anything that failed.</p>
        </div>
      </main>
    </>
  );
}
