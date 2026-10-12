import type { Metadata } from "next";
import { SimpleNav } from "@/components/SimpleNav";
import { TopicsAdmin } from "@/components/TopicsAdmin";

export const metadata: Metadata = { title: "Topics", description: "Manage the categories and keywords that are monitored.", robots: { index: false, follow: false } };

export default function TopicsPage() {
  return (
    <>
      <SimpleNav />
      <main id="main" className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <p className="eyebrow">Behind the Run now passcode</p>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(40px, 7vw, 84px)", letterSpacing: "-.04em", lineHeight: 0.95, margin: "16px 0 12px" }}>Topics</h1>
        <p className="muted measure">Add, rename, move and switch categories and keywords on or off. Nothing is ever deleted: switching off hides a topic from future runs and keeps its past numbers. Topics are stored in Neon Postgres.</p>
        <p className="muted measure small" style={{ marginTop: 8 }}>A new or re-typed keyword is backfilled straight away: the last 14 days are fetched for just that keyword, so its trend shows on the dashboard right away (labelled &ldquo;backfilled&rdquo;). Renames and moves show in the next brief; counts stay linked by id.</p>
        <TopicsAdmin />
      </main>
    </>
  );
}
