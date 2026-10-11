import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard-data";
import { healthySources } from "@/lib/health";
import { formatIst, relativeTime } from "@/lib/format";
import { SOURCE_NAMES, SOURCES } from "@/lib/types";
import { PainTable } from "./PainTable";
import { Watchlist } from "./Watchlist";
import { Unresolved } from "./Unresolved";
import { RunNow } from "./RunNow";
import { CopyBrief } from "./CopyBrief";
import { SourceBadge, Sparkline, StatusChip } from "./ui";

function Banner({ data }: { data: DashboardData }) {
  const items: { text: string; error?: boolean }[] = [];
  const { latest, shown, brief } = data;
  if (latest && latest.status === "running") items.push({ text: "A run is in progress. Refresh in a minute to see the result." });
  if (latest && latest.status === "failed") items.push({ error: true, text: `The latest run failed${latest.error ? `: ${latest.error.slice(0, 220)}` : "."}${shown && shown.id !== latest.id ? " Showing the most recent brief instead." : ""}` });
  if (latest && latest.status === "partial" && shown?.id === latest.id) items.push({ text: "The latest run is partial: some data or steps were unavailable, listed below." });
  if (brief) {
    for (const n of brief.content.data_quality) items.push({ text: n });
    if (brief.content.ai.status === "unavailable") items.push({ text: `AI analysis unavailable this week${brief.content.ai.reason ? ` (${brief.content.ai.reason.slice(0, 160)})` : ""}. Counts, trends and links below come straight from the database.` });
    if (brief.email_status === "failed") items.push({ error: true, text: `The email was not delivered${brief.email_error ? `: ${brief.email_error}` : "."} The catch-up job retries it.` });
    if (brief.email_status === "pending") items.push({ text: "The email has not been sent yet." });
  }
  if (items.length === 0) return null;
  const hasErr = items.some((i) => i.error);
  return (
    <div className={`banner${hasErr ? " error" : ""}`} role="status">
      <strong>{hasErr ? "Needs attention" : "Heads up"}</strong>
      <ul>{items.map((i, n) => <li key={n}>{i.text}</li>)}</ul>
    </div>
  );
}

export function BriefView({ data, showRunNow = true }: { data: DashboardData; showRunNow?: boolean }) {
  const now = new Date(data.now);
  const c = data.brief?.content ?? null;
  const shown = data.shown;
  const latest = data.latest;
  const updated = shown ? new Date(shown.finished_at ?? shown.started_at) : null;
  const minMentions = data.settings?.min_mentions ?? 5;
  const sourceStatus = shown?.source_status ?? null;
  const healthy = sourceStatus ? healthySources(sourceStatus) : null;
  const rising = c ? c.categories.filter((x) => x.trend_kind === "up").length : 0;
  const byCat = new Map<string, typeof data.spark>();
  for (const p of data.spark) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  const sparkRuns = new Set(data.spark.map((p) => p.run_id)).size;
  const cats = [...new Set(data.topics.map((t) => t.category))];

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="id">
          <h1>Developer Community Pulse</h1>
          <p className="muted measure">A weekly read on what developers are struggling with in code review, CI/CD and workflow, from live public discussions.</p>
          <div className="meta">
            {updated && <span>Updated {formatIst(updated)} ({relativeTime(updated, now)})</span>}
            {latest && <span>Latest run: <StatusChip status={latest.status} /></span>}
            <nav aria-label="Pages"><Link href="/">Dashboard</Link><Link href="/about">How it works</Link></nav>
          </div>
        </div>
        {showRunNow && <RunNow />}
      </header>

      {!data.configured && (
        <div className="banner error" role="alert" style={{ marginTop: 24 }}>
          <strong>Database not connected.</strong> Set DATABASE_URL (your Neon connection string) in the environment, then reload.
        </div>
      )}
      {data.loadError && (
        <div className="banner error" role="alert" style={{ marginTop: 24 }}>
          <strong>Could not load data.</strong> {data.loadError}
        </div>
      )}
      {data.notFound && <div className="note" style={{ marginTop: 24 }}>That run does not exist. <Link href="/">Back to the dashboard</Link>.</div>}
      {data.configured && !data.loadError && !data.notFound && <Banner data={data} />}

      {data.configured && !data.loadError && !data.notFound && !c && (
        <section>
          <p className="note">No brief yet. Press Run now to collect this week&apos;s data.</p>
        </section>
      )}

      {c && (
        <>
          <div className="strip" aria-label="This week at a glance">
            <p className="window">{c.window_sentence}</p>
            <div className="stats">
              <div className="stat"><div className="n">{c.totals.current} <small>/ {c.totals.previous}</small></div><div className="l">Unique posts, this week / last week</div></div>
              <div className="stat"><div className="n">{rising} <small>of {c.categories.length}</small></div><div className="l">Categories rising</div></div>
              <div className="stat"><div className="n">{c.unresolved.length}</div><div className="l">Potentially unresolved discussions</div></div>
              <div className="stat"><div className="n">{healthy ?? "n/a"} <small>of 3</small></div><div className="l">Sources healthy</div></div>
            </div>
          </div>

          <section aria-labelledby="h-exec">
            <header><h2 id="h-exec">Executive summary</h2><CopyBrief text={data.briefText} /></header>
            {c.executive_summary ? (
              <div className="panel">
                <p className="summary-text">{c.executive_summary}</p>
                <p className="small muted" style={{ marginTop: 8 }}>Written by Gemini. All numbers and links come from the database.</p>
              </div>
            ) : (
              <p className="note">AI analysis unavailable this week. Every number, trend and link on this page is still calculated by code from the database.</p>
            )}
          </section>

          <section aria-labelledby="h-pain">
            <header><h2 id="h-pain">Pain points: this week versus last week</h2><p>Mentions are unique posts per category. Open a row for its keywords and best evidence.</p></header>
            <PainTable categories={c.categories} minMentions={minMentions} />
          </section>

          <section aria-labelledby="h-trend">
            <header><h2 id="h-trend">Trend history</h2><p>Mentions per category across past runs, oldest to newest. Hollow dots mean incomplete data.</p></header>
            {sparkRuns < 2 ? (
              <p className="note">History appears here once there are two or more runs. Each run adds one point per category.</p>
            ) : (
              <div className="sparks">
                {c.categories.map((cat) => {
                  const pts = (byCat.get(cat.category) ?? []).sort((a, b) => a.anchor.localeCompare(b.anchor));
                  if (pts.length < 2) return null;
                  return (
                    <div className="spark" key={cat.category}>
                      <span className="t">{cat.category}</span>
                      <Sparkline values={pts.map((p) => p.current_count)} incomplete={pts.map((p) => p.data_status === "incomplete")} label={`${cat.category}: ${pts.map((p) => p.current_count).join(", ")} mentions across runs`} />
                      <span className="small muted mono">{pts[0].current_count} to {pts[pts.length - 1].current_count} over {pts.length} runs</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="h-kw">
            <header><h2 id="h-kw">Keyword watchlist</h2><p>Did &ldquo;false positive&rdquo; appear 4 times or 14? Counts per keyword, this week versus last week.</p></header>
            <Watchlist categories={c.categories} />
          </section>

          <section aria-labelledby="h-insight">
            <header><h2 id="h-insight">Pain points and product opportunities</h2><p>Written by Gemini from the evidence posts. Links are looked up in the database.</p></header>
            <div className="cat-insights">
              {c.categories.map((cat) => (
                <div className="panel" key={cat.category}>
                  <h3>{cat.category}</h3>
                  {cat.headline && <p className="measure">{cat.headline}</p>}
                  {cat.pain_points.length === 0 && cat.opportunities.length === 0 ? (
                    <p className="small muted">{c.ai.status === "ok" ? "No AI commentary for this category this week." : "AI analysis unavailable this week."}</p>
                  ) : (
                    <div className="cols">
                      <div>
                        <h4>TOP PAIN POINTS</h4>
                        {cat.pain_points.length === 0 ? <p className="small muted">None cited.</p> : (
                          <ul>{cat.pain_points.map((p, i) => (
                            <li key={i}>{p.label}<span className="chips">{p.evidence.map((e) => <span className="evchip" key={e.source + e.post_id}><SourceBadge source={e.source} /><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></span>)}</span></li>
                          ))}</ul>
                        )}
                      </div>
                      <div>
                        <h4>PRODUCT OPPORTUNITIES</h4>
                        {cat.opportunities.length === 0 ? <p className="small muted">None cited.</p> : (
                          <ul>{cat.opportunities.map((p, i) => (
                            <li key={i}>{p.text}<span className="chips">{p.evidence.map((e) => <span className="evchip" key={e.source + e.post_id}><SourceBadge source={e.source} /><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></span>)}</span></li>
                          ))}</ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="h-unres">
            <header><h2 id="h-unres">Potentially unresolved discussions</h2><p>Based on replies and answers at the time we looked. Open the link to verify.</p></header>
            <Unresolved items={c.unresolved} />
          </section>
        </>
      )}

      {data.configured && !data.loadError && !data.notFound && (
        <>
          <section aria-labelledby="h-health">
            <header><h2 id="h-health">Source health and data quality</h2><p>From the run shown above.</p></header>
            {!sourceStatus ? <p className="note">No run to report on yet.</p> : (
              <div className="health">
                {SOURCES.map((s) => {
                  const x = sourceStatus.sources[s];
                  return (
                    <div className="panel" key={s}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3>{SOURCE_NAMES[s]}</h3>
                        <span className={`chip ${x.status === "ok" ? "status-sent" : x.status === "degraded" ? "status-partial" : "status-failed"}`}>{x.status === "ok" ? "OK" : x.status === "degraded" ? "Degraded" : "Failed"}</span>
                      </div>
                      <dl>
                        <dt>Requests</dt><dd>{x.requests - x.failed} ok / {x.failed} failed</dd>
                        <dt>Posts fetched</dt><dd>{x.posts}</dd>
                        <dt>Retries used</dt><dd>{x.retries}</dd>
                        <dt>Last error</dt><dd>{x.last_error ?? "none"}</dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="h-topics">
            <header><h2 id="h-topics">Monitored topics</h2><p>Edit these in Neon (Tables or SQL Editor), no code change needed. <Link href="/about">How the numbers are counted</Link>.</p></header>
            <div className="panel topics">
              {cats.length === 0 ? <p className="muted">No active topics. Switch at least one keyword on in the topics table (Neon: Tables).</p> : cats.map((cat) => (
                <div className="row" key={cat}>
                  <strong>{cat}</strong>
                  {data.topics.filter((t) => t.category === cat).map((t) => <span className="kw" key={t.id}>{t.keyword}</span>)}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="h-runs">
            <header><h2 id="h-runs">Run history</h2></header>
            {data.runs.length === 0 ? <p className="note">No runs yet.</p> : (
              <div className="tablewrap">
                <table className="stack">
                  <caption className="sr-only">Past runs</caption>
                  <thead><tr><th scope="col">Started (IST)</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Window ends (IST)</th><th scope="col" className="num">Attempts</th><th scope="col">Brief</th></tr></thead>
                  <tbody>
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="first">{formatIst(r.started_at)}</td>
                        <td data-label="Type">{r.run_type}</td>
                        <td data-label="Status"><StatusChip status={r.status} /></td>
                        <td data-label="Window ends">{formatIst(r.anchor)}</td>
                        <td className="num" data-label="Attempts">{r.attempts}</td>
                        <td data-label="Brief">{r.has_brief ? <Link href={`/runs/${r.id}`}>Open brief</Link> : <span className="muted">none</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <footer>
        <p><Link href="/about">Methodology: how the numbers are counted</Link></p>
        <p>Data: <a href="https://hn.algolia.com/api" target="_blank" rel="noopener noreferrer">Hacker News (Algolia)</a>, <a href="https://developers.forem.com/api" target="_blank" rel="noopener noreferrer">Dev.to</a>, <a href="https://api.stackexchange.com" target="_blank" rel="noopener noreferrer">Stack Exchange</a>. AI: Gemini Flash.</p>
        <p>The Friday 8:00 AM IST schedule may fire anywhere within its hour on the free Vercel plan. A catch-up job runs an hour later.</p>
      </footer>
    </div>
  );
}


