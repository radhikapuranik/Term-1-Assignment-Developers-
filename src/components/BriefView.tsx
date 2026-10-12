import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard-data";
import { healthySources } from "@/lib/health";
import { formatIst, formatIstShort, relativeTime } from "@/lib/format";
import { buildHistory, isThin, pickHighlights, pulseSpikes, ratioNote } from "@/lib/highlights";
import { runNote } from "@/lib/run-note";
import { SOURCE_NAMES, SOURCES } from "@/lib/types";
import { changeText } from "@/lib/brief";
import { PainTable } from "./PainTable";
import { Watchlist } from "./Watchlist";
import { Unresolved } from "./Unresolved";
import { RunNow } from "./RunNow";
import { CopyBrief } from "./CopyBrief";
import { MotionRoot } from "./MotionRoot";
import { NumberTip } from "./NumberTip";
import { PulseLine } from "./PulseLine";
import { SectionNav, type NavItem } from "./SectionNav";
import { Flatline } from "./Illustrations";
import { SourceBadge, Sparkline, StatusChip, TrendChip, trendExplain } from "./ui";

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

function SecHead({ idx, title, hid, desc, children }: { idx: string; title: string; hid: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="sec-head" data-reveal>
      <span className="idx">{idx}</span>
      <h2 id={hid}>{title}</h2>
      {desc && <p>{desc}</p>}
      {children && <div className="tools">{children}</div>}
    </header>
  );
}

/** Hand-drawn shapes that drift at different speeds (decoration only). */
function Deco() {
  return (
    <div aria-hidden="true">
      <div className="deco" data-speed="0.35" data-lag="0.9" style={{ right: "7%", top: "12%", width: 120 }}>
        <svg viewBox="0 0 100 100"><path className="st" stroke="var(--hl)" d="M50 10 C78 8 94 32 90 54 C86 80 58 94 34 86 C12 78 6 50 16 30 C24 16 38 12 54 11" /></svg>
      </div>
      <div className="deco" data-speed="0.15" style={{ right: "22%", top: "44%", width: 96 }}>
        <svg viewBox="0 0 90 40"><path className="st" stroke="var(--rising)" d="M4 30 L24 8 L44 30 L64 8 L84 30" /></svg>
      </div>
      <div className="deco" data-speed="0.5" data-lag="1.4" style={{ right: "4%", top: "52%", width: 64 }}>
        <svg viewBox="0 0 60 60"><path className="st" stroke="var(--new)" d="M30 6 V54 M8 18 L52 42 M52 18 L8 42" /></svg>
      </div>
      <div className="deco" data-speed="0.25" data-lag="0.5" style={{ right: "17%", top: "33%", width: 60 }}>
        <svg viewBox="0 0 60 30"><path className="st" stroke="var(--falling)" d="M4 20 C14 4 22 4 30 16 S46 28 56 10" /></svg>
      </div>
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
  const trendsKnown = c ? c.categories.some((x) => x.data_status === "complete") : true; // false when every category is missing data
  const byCat = new Map<string, typeof data.spark>();
  for (const p of data.spark) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  const cats = [...new Set(data.topics.map((t) => t.category))];
  const ok = data.configured && !data.loadError && !data.notFound;
  const spikes = c ? pulseSpikes(c.categories) : null;
  const hl = c ? pickHighlights(c) : null;

  const nav: NavItem[] = [
    ...(c ? [
      { id: "now", label: "10 seconds" }, { id: "summary", label: "Summary" }, { id: "pain", label: "Pain points" },
      { id: "trends", label: "Trends" }, { id: "keywords", label: "Keywords" }, { id: "insights", label: "Insights" }, { id: "unresolved", label: "Unresolved" },
    ] : []),
    { id: "sources", label: "Sources" }, { id: "topics", label: "Topics" }, { id: "history", label: "History" },
  ];

  const windowTip = c ? `Unique posts created in the 7 days ending ${formatIst(c.anchor)}. A post is counted once, even if it matches several keywords or categories (deduplicated by source and ID). Last week is the 7 days before.` : "";

  return (
    <MotionRoot runKey={shown?.id ?? "none"}>
      <SectionNav items={nav} spikes={spikes} />
      <div className="wrap" id="top">
        <header className="hero">
          <Deco />
          <div className="hero-top">
            <div className="eyebrow">
              <span>Developer Community Pulse</span>
              {updated && <span>Updated {formatIst(updated)} ({relativeTime(updated, now)})</span>}
              {latest && <span>Latest run <StatusChip status={latest.status} /></span>}
              <Link href="/about">How it works</Link>
            </div>
            {showRunNow && <RunNow />}
          </div>

          <h1>
            <span className="hero-line">What developers</span>
            <span className="hero-line">
              are <span className="kw">struggling
                <svg className="squiggle" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path data-draw="squiggle" pathLength={1} d="M2 8 C14 0 26 14 38 7 S62 0 74 7 S98 14 110 7 S134 0 146 7 S170 14 198 6" /></svg>
              </span>
            </span>
            <span className="hero-line">with this week.</span>
            {c && (
              <span className="hero-numbers">
                <NumberTip text={windowTip}><span className="n">{c.totals.current}</span></NumberTip> discussions read.{" "}
                {trendsKnown ? (
                  <>
                    <NumberTip text="Categories whose trend is Up: more mentions than last week, beyond the flat threshold, with enough data."><span className="n">{rising}</span></NumberTip> {rising === 1 ? "pain point" : "pain points"} rising.{" "}
                  </>
                ) : (
                  <>Trends unavailable, data incomplete.{" "}</>
                )}
                <NumberTip text="Posts where the source showed few or no replies when we looked. Based on replies and answers at fetch time. Open each link to verify."><span className="n">{c.unresolved.length}</span></NumberTip> potentially unresolved.
              </span>
            )}
          </h1>

          <div className="pulse-wrap">
            {spikes && spikes.length > 0 ? (
              <>
                <div className="only-wide"><PulseLine spikes={spikes} id="hero" /></div>
                <div className="only-phone"><PulseLine spikes={spikes} variant="phone" id="hero-phone" /></div>
              </>
            ) : <Flatline variant="empty" label="A flat pulse line: no data collected yet" />}
          </div>
        </header>
      </div>

      <main id="main" className="wrap">
        {!data.configured && (
          <div className="banner error" role="alert">
            <strong>Database not connected.</strong> Set DATABASE_URL (your Neon connection string) in the environment, then reload.
          </div>
        )}
        {data.loadError && (
          <div className="banner error" role="alert"><strong>Could not load data.</strong> {data.loadError}</div>
        )}
        {data.notFound && <div className="note" style={{ marginTop: 24 }}>That run does not exist. <Link href="/">Back to the dashboard</Link>.</div>}
        {ok && <Banner data={data} />}

        {ok && !c && (
          <section aria-label="No brief yet">
            <p className="note"><Flatline variant="empty" label="Flat line" /><span>No brief yet. Press Run now to collect this week&apos;s data.</span></p>
          </section>
        )}

        {c && hl && (
          <>
            <section id="now" aria-labelledby="h-now">
              <SecHead idx="01 / NOW" title="This week in 10 seconds" hid="h-now" desc="If you read only this, you have the answer." />
              <div className="ten">
                {/* Biggest riser */}
                <div className="ten-item">
                  <div className="ten-label">Biggest riser {hl.riser && <TrendChip kind="up" label={hl.riser.trend_label} />}</div>
                  {hl.riser ? (
                    <>
                      <p className="ten-name">{hl.riser.category}</p>
                      <div className="numrow">
                        <NumberTip text={`Change in unique posts, this week versus last week: ${hl.riser.current_count} versus ${hl.riser.previous_count}. Window: ${c.window_sentence}.`}>
                          <span className="bignum up">
                            <svg className="circle-mark" viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true"><path data-draw="scroll" pathLength={1} d="M60 4 C20 2 3 18 6 32 C9 50 45 58 78 54 C108 50 118 30 108 16 C98 4 70 2 44 6" /></svg>
                            <span data-count={hl.riser.pct_change ?? 0} data-decimals="1" data-prefix="+" data-suffix="%" suppressHydrationWarning>{changeText(hl.riser)}</span>
                          </span>
                        </NumberTip>
                        {ratioNote(hl.riser) && (
                          <span className="arrow-note">
                            <svg viewBox="0 0 44 30" aria-hidden="true"><path data-draw="scroll" pathLength={1} d="M42 26 C30 24 14 20 8 6 M8 6 L4 14 M8 6 L16 9" /></svg>
                            {ratioNote(hl.riser)}
                          </span>
                        )}
                      </div>
                      <p className="ten-line">{hl.riser.headline ?? trendExplain("up", minMentions)}</p>
                      <p className="ten-foot mono muted">{hl.riser.current_count} this week vs {hl.riser.previous_count} last week</p>
                      {hl.riser.evidence[0] && <p className="ten-foot"><SourceBadge source={hl.riser.evidence[0].source} /><a href={hl.riser.evidence[0].url} target="_blank" rel="noopener noreferrer">{hl.riser.evidence[0].title}</a></p>}
                    </>
                  ) : (
                    <>
                      <p className="ten-name">Nothing is clearly rising</p>
                      <p className="ten-line muted">Either no category is above the flat threshold, or counts are too small to call a trend. Open the pain points table for the detail.</p>
                    </>
                  )}
                </div>

                {/* Biggest faller */}
                <div className="ten-item">
                  <div className="ten-label">Biggest faller {hl.faller && <TrendChip kind={hl.faller.trend_kind} label={hl.faller.trend_label} />}</div>
                  {hl.faller ? (
                    <>
                      <p className="ten-name">{hl.faller.category}</p>
                      <div className="numrow">
                        <NumberTip text={`Change in unique posts, this week versus last week: ${hl.faller.current_count} versus ${hl.faller.previous_count}. Window: ${c.window_sentence}.`}>
                          <span className="bignum down"><span data-count={hl.faller.pct_change ?? 0} data-decimals="1" data-suffix="%" suppressHydrationWarning>{changeText(hl.faller)}</span></span>
                        </NumberTip>
                      </div>
                      <p className="ten-line">{hl.faller.headline ?? trendExplain(hl.faller.trend_kind, minMentions)}</p>
                      <p className="ten-foot mono muted">{hl.faller.current_count} this week vs {hl.faller.previous_count} last week</p>
                      {hl.faller.evidence[0] && <p className="ten-foot"><SourceBadge source={hl.faller.evidence[0].source} /><a href={hl.faller.evidence[0].url} target="_blank" rel="noopener noreferrer">{hl.faller.evidence[0].title}</a></p>}
                    </>
                  ) : (
                    <>
                      <p className="ten-name">Nothing is clearly falling</p>
                      <p className="ten-line muted">No category dropped beyond the flat threshold with enough data to call it.</p>
                    </>
                  )}
                </div>

                {/* Most important potentially unresolved */}
                <div className="ten-item">
                  <div className="ten-label">Potentially unresolved</div>
                  {hl.unresolved ? (
                    <>
                      <p className="ten-name"><a href={hl.unresolved.url} target="_blank" rel="noopener noreferrer">{hl.unresolved.title}</a></p>
                      <div className="numrow">
                        <NumberTip text="Discussions where the source showed few or no replies when we looked (based on replies and answers at fetch time). Open each link to verify."><span className="bignum neutral"><span data-count={c.unresolved.length} suppressHydrationWarning>{c.unresolved.length}</span></span></NumberTip>
                        <span className="muted small">in total this week</span>
                      </div>
                      <p className="ten-line">{hl.unresolved.reason}.</p>
                      <p className="ten-foot muted"><SourceBadge source={hl.unresolved.source} /> Posted {formatIst(hl.unresolved.created_at, false)}. Checked {formatIst(hl.unresolved.fetched_at, false)}.</p>
                    </>
                  ) : (
                    <>
                      <p className="ten-name">None flagged</p>
                      <p className="ten-line muted">No discussion showed few or no replies at the time we looked.</p>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section id="summary" aria-labelledby="h-summary">
              <SecHead idx="02 / SUMMARY" title="The week in numbers" hid="h-summary" desc={c.window_sentence}>
                <CopyBrief text={data.briefText} />
              </SecHead>
              <div className="stats strip">
                <div className="stat"><div className="n"><NumberTip text={windowTip}><span data-count={c.totals.current} suppressHydrationWarning>{c.totals.current}</span></NumberTip> <small>/ {c.totals.previous}</small></div><div className="l">Unique posts, this week / last week</div></div>
                <div className="stat"><div className="n">{trendsKnown ? (<><NumberTip text="Categories whose trend label is Up."><span data-count={rising} suppressHydrationWarning>{rising}</span></NumberTip> <small>of {c.categories.length}</small></>) : (<NumberTip text="A source did not respond, so no trend is claimed for any category this run."><span>n/a</span></NumberTip>)}</div><div className="l">Categories rising</div></div>
                <div className="stat"><div className="n"><NumberTip text="Posts where the source showed few or no replies at the time we looked. Open the link to verify."><span data-count={c.unresolved.length} suppressHydrationWarning>{c.unresolved.length}</span></NumberTip></div><div className="l">Potentially unresolved discussions</div></div>
                <div className="stat"><div className="n"><NumberTip text="Sources where every request succeeded in this run."><span>{healthy ?? "n/a"}</span></NumberTip> <small>of 3</small></div><div className="l">Sources healthy</div></div>
              </div>
              <div style={{ marginTop: 48 }}>
                {c.executive_summary ? (
                  <>
                    <p className="lede">{c.executive_summary}</p>
                    <p className="lede-note">Written by Gemini. All numbers and links come from the database.</p>
                  </>
                ) : (
                  <p className="note">AI analysis unavailable this week. Every number, trend and link on this page is still calculated by code from the database.</p>
                )}
              </div>
            </section>

            <section id="pain" aria-labelledby="h-pain">
              <SecHead idx="03 / PAIN POINTS" title="Pain points, week on week" hid="h-pain" desc="Mentions are unique posts per category. Open a row for its keywords and best evidence." />
              <PainTable categories={c.categories} minMentions={minMentions} anchor={c.anchor} />
              <p className="small muted measure" style={{ marginTop: 16 }}>A post can count in more than one category, so category totals can add up to more than &ldquo;unique posts&rdquo;. Dev.to is fetched by tag and filtered by keyword in code.</p>
            </section>

            <section id="trends" aria-labelledby="h-trend">
              <SecHead idx="04 / TRENDS" title="Trend history" hid="h-trend" desc="Earlier Fridays, then last week and this week, all from the same stored numbers as the table above. Hollow dots mean incomplete data." />
              <div className="sparks">
                {c.categories.map((cat) => {
                  const older = (byCat.get(cat.category) ?? []).sort((a, b) => a.anchor.localeCompare(b.anchor)).map((p) => ({ label: formatIstShort(p.anchor).slice(0, -6), current_count: p.current_count, data_status: p.data_status }));
                  const pts = buildHistory(cat, older);
                  return (
                    <div className="spark" key={cat.category}>
                      <span className="t">{cat.category}</span>
                      <Sparkline values={pts.map((p) => p.value)} incomplete={pts.map((p) => p.incomplete)} label={`${cat.category}: ${pts.map((p) => `${p.label} ${p.value}`).join(", ")} mentions`} />
                      <span className="endnum">{pts.length > 2 ? `${pts.map((p) => p.value).join(" → ")}` : `last week ${cat.previous_count} → this week ${cat.current_count}`}</span>
                    </div>
                  );
                })}
              </div>
              {data.spark.length === 0 && <p className="small muted" style={{ marginTop: 16 }}>Earlier weeks are added here after each Friday run.</p>}
            </section>

            <section id="keywords" aria-labelledby="h-kw">
              <SecHead idx="05 / KEYWORDS" title="Keyword watchlist" hid="h-kw" desc={<>Did &ldquo;false positive&rdquo; appear 4 times or 14? Exact counts per keyword.</>} />
              <Watchlist categories={c.categories} />
            </section>

            <section id="insights" aria-labelledby="h-insight">
              <SecHead idx="06 / INSIGHTS" title="Pain points and product opportunities" hid="h-insight" desc="Written by Gemini from the evidence posts. Links are looked up in the database." />
              <div className="cat-insights">
                {c.categories.map((cat) => (
                  <div className="cat" key={cat.category}>
                    <h3>{cat.category}{isThin(cat) && <> <span className="tag thin">thin evidence</span></>}</h3>
                    <div className="body">
                      {cat.headline && <p className="measure">{cat.headline}</p>}
                      {cat.pain_points.length === 0 && cat.opportunities.length === 0 ? (
                        <p className="small muted">{c.ai.status === "ok" ? "No AI commentary for this category this week." : "AI analysis unavailable this week."}</p>
                      ) : (
                        <div className="cols">
                          <div>
                            <p className="h4">Top pain points</p>
                            {cat.pain_points.length === 0 ? <p className="small muted">None cited.</p> : (
                              <ul>{cat.pain_points.map((p, i) => (
                                <li key={i}>{p.label}<span className="chips">{p.evidence.map((e) => <span className="evchip" key={e.source + e.post_id}><SourceBadge source={e.source} /><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></span>)}</span></li>
                              ))}</ul>
                            )}
                          </div>
                          <div>
                            <p className="h4">Product opportunities</p>
                            {cat.opportunities.length === 0 ? <p className="small muted">None cited.</p> : (
                              <ul>{cat.opportunities.map((p, i) => (
                                <li key={i}>{p.text}<span className="chips">{p.evidence.map((e) => <span className="evchip" key={e.source + e.post_id}><SourceBadge source={e.source} /><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></span>)}</span></li>
                              ))}</ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="unresolved" aria-labelledby="h-unres">
              <SecHead idx="07 / UNRESOLVED" title="Potentially unresolved discussions" hid="h-unres" desc="Based on replies and answers at the time we looked. Open the link to verify." />
              <Unresolved items={c.unresolved} />
            </section>
          </>
        )}

        {ok && (
          <>
            <section id="sources" aria-labelledby="h-health">
              <SecHead idx={c ? "08 / SOURCES" : "01 / SOURCES"} title="Source health and data quality" hid="h-health" desc="From the run shown above." />
              {!sourceStatus ? <p className="note">No run to report on yet.</p> : (
                <div className="health">
                  {SOURCES.map((s) => {
                    const x = sourceStatus.sources[s];
                    return (
                      <div className="src" key={s}>
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

            <section id="topics" aria-labelledby="h-topics">
              <SecHead idx={c ? "09 / TOPICS" : "02 / TOPICS"} title="Monitored topics" hid="h-topics" desc={<>Edit these in Neon (Tables or SQL Editor), no code change needed. <Link href="/about">How the numbers are counted</Link>.</>} />
              <div className="topics">
                {cats.length === 0 ? <p className="muted">No active topics. Switch at least one keyword on in the topics table (Neon: Tables).</p> : cats.map((cat) => (
                  <div className="row" key={cat}>
                    <strong>{cat}</strong>
                    {data.topics.filter((t) => t.category === cat).map((t) => <span className="kwtag" key={t.id}>{t.keyword}</span>)}
                  </div>
                ))}
              </div>
            </section>

            <section id="history" aria-labelledby="h-runs">
              <SecHead idx={c ? "10 / HISTORY" : "03 / HISTORY"} title="Run history" hid="h-runs" />
              {data.runs.length === 0 ? <p className="note">No runs yet.</p> : (
                <div className="tablewrap">
                  <table className="stack">
                    <caption className="sr-only">Past runs</caption>
                    <thead><tr><th scope="col">Started (IST)</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Window ends (IST)</th><th scope="col" className="num">Attempts</th><th scope="col">Note</th><th scope="col">Brief</th></tr></thead>
                    <tbody>
                      {data.runs.map((r) => (
                        <tr key={r.id}>
                          <td className="first">{formatIst(r.started_at)}</td>
                          <td data-label="Type">{r.run_type}</td>
                          <td data-label="Status"><StatusChip status={r.status} /></td>
                          <td data-label="Window ends">{formatIst(r.anchor)}</td>
                          <td className="num" data-label="Attempts">{r.attempts}</td>
                          <td data-label="Note" className="small">{runNote(r) ?? <span className="muted">—</span>}</td>
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
          <p>Data: <a href="https://hn.algolia.com/api" target="_blank" rel="noopener noreferrer">Hacker News (Algolia)</a>, <a href="https://developers.forem.com/api" target="_blank" rel="noopener noreferrer">Dev.to</a>, <a href="https://api.stackexchange.com" target="_blank" rel="noopener noreferrer">Stack Exchange</a>. AI: Gemini Flash. Motion: GSAP.</p>
          <p>Config and history live in Neon Postgres, the Supabase/Neon option allowed by the course stack.</p>
          <p>The Friday 8:00 AM IST schedule may fire anywhere within its hour on the free Vercel plan. A catch-up job runs an hour later.</p>
        </footer>
      </main>
    </MotionRoot>
  );
}
