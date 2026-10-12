"use client";
import { Fragment, useMemo, useState } from "react";
import type { BriefCategory } from "@/lib/brief";
import { changeText } from "@/lib/brief";
import { labelToKind } from "@/lib/trend";
import { formatIstShort } from "@/lib/format";
import { slug } from "@/lib/highlights";
import { NumberTip } from "./NumberTip";
import { PairedBars, SourceBadge, TrendChip, trendExplain } from "./ui";

type SortKey = "current" | "previous" | "change" | "name";

export function PainTable({ categories, minMentions, anchor }: { categories: BriefCategory[]; minMentions: number; anchor: string }) {
  const A = new Date(anchor).getTime();
  const WEEK = 7 * 24 * 3600 * 1000;
  const win = (weeks: 0 | 1) => `${formatIstShort(new Date(A - (weeks + 1) * WEEK))} to ${formatIstShort(new Date(A - weeks * WEEK))} IST`;
  const how = (c: BriefCategory, w: 0 | 1) => `Unique posts matching ${c.keywords.map((k) => k.keyword).join(", ")}, created ${win(w)} (${w === 0 ? "this week" : "last week"}), from Hacker News, Dev.to and Stack Overflow. Counted once per category, deduplicated by source and ID.`;
  const [sort, setSort] = useState<SortKey>("current");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const max = Math.max(1, ...categories.flatMap((c) => [c.current_count, c.previous_count]));
  const rows = useMemo(() => {
    const r = [...categories];
    const pct = (c: BriefCategory) => (c.pct_change === null ? -Infinity : c.pct_change);
    r.sort((a, b) =>
      sort === "name" ? a.category.localeCompare(b.category)
      : sort === "previous" ? b.previous_count - a.previous_count
      : sort === "change" ? pct(b) - pct(a)
      : b.current_count - a.current_count || a.category.localeCompare(b.category));
    return r;
  }, [categories, sort]);
  const toggle = (c: string) => setOpen((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <>
      <div className="controls" style={{ marginBottom: 12 }}>
        <label htmlFor="pain-sort">Sort by</label>
        <select id="pain-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="current">This week (most first)</option>
          <option value="previous">Last week</option>
          <option value="change">Change</option>
          <option value="name">Category name</option>
        </select>
      </div>
      <div className="tablewrap">
        <table className="stack-wide">
          <caption className="sr-only">Pain point categories: mentions this week versus last week, with trend</caption>
          <thead>
            <tr><th scope="col">Category</th><th scope="col" className="num">This week</th><th scope="col" className="num">Last week</th><th scope="col" className="num">Change</th><th scope="col">Trend</th><th scope="col">Data</th><th scope="col">This week vs last week</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const kind = c.trend_kind ?? labelToKind(c.trend_label);
              const isOpen = open.has(c.category);
              return (
                <Fragment key={c.category}>
                  <tr data-pulse-row={c.category}>
                    <td className="first">
                      <button type="button" className="rowbtn" aria-expanded={isOpen} aria-controls={`d-${slug(c.category)}`} onClick={() => toggle(c.category)}>
                        <svg className="chev" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
                        <span className="name">{c.category}</span>
                      </button>
                      {c.recently_added && <> <span className="tag">recently added</span></>}
                    </td>
                    <td className="num" data-label="This week"><NumberTip text={how(c, 0)}><span data-count={c.current_count} suppressHydrationWarning>{c.current_count}</span></NumberTip></td>
                    <td className="num" data-label="Last week"><NumberTip text={how(c, 1)}>{c.previous_count}</NumberTip></td>
                    <td className="num" data-label="Change">{changeText({ pct_change: c.pct_change, trend_kind: kind })}</td>
                    <td data-label="Trend"><TrendChip kind={kind} label={c.trend_label} /></td>
                    <td data-label="Data" className="small">{c.data_status === "complete" ? <span className="muted">Complete</span> : <span style={{ color: "var(--incomplete)" }}>Incomplete</span>}</td>
                    <td className="bars" data-label="Bars"><PairedBars current={c.current_count} previous={c.previous_count} max={max} label={`${c.category}: ${c.current_count} this week, ${c.previous_count} last week`} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="detail" id={`d-${slug(c.category)}`}>
                      <td colSpan={7}>
                        <div className="detail-body">
                        <p className="small muted" style={{ marginBottom: 12 }}>{trendExplain(kind, minMentions)}</p>
                        <div className="detail-grid">
                          <div>
                            <p className="h4">Keywords in this category</p>
                            <ul className="kwlist">
                              {c.keywords.map((k) => (
                                <li key={k.keyword}><span className="mono">{k.keyword}</span><span className="mono muted">{k.current_count} vs {k.previous_count}</span></li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="h4">Most discussed this week</p>
                            {c.evidence.length === 0 ? <p className="small muted">No posts this week.</p> : (
                              <ul className="evlist">
                                {c.evidence.map((e) => (
                                  <li key={`${e.source}:${e.post_id}`}><SourceBadge source={e.source} /><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
