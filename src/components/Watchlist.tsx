"use client";
import { useMemo, useState } from "react";
import type { BriefCategory } from "@/lib/brief";
import { changeText } from "@/lib/brief";
import { labelToKind } from "@/lib/trend";
import { TrendChip } from "./ui";

type Key = "keyword" | "category" | "current" | "previous" | "change";

export function Watchlist({ categories }: { categories: BriefCategory[] }) {
  const [key, setKey] = useState<Key>("current");
  const [dir, setDir] = useState<1 | -1>(-1);
  const all = useMemo(() => categories.flatMap((c) => c.keywords.map((k) => ({ ...k, category: c.category }))), [categories]);
  const rows = useMemo(() => {
    const v = (r: (typeof all)[number]) => key === "keyword" ? r.keyword.toLowerCase() : key === "category" ? r.category.toLowerCase()
      : key === "current" ? r.current_count : key === "previous" ? r.previous_count : (r.pct_change ?? -Infinity);
    return [...all].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.keyword.localeCompare(b.keyword); });
  }, [all, key, dir]);
  const th = (k: Key, label: string, num = false) => (
    <th scope="col" className={num ? "num" : undefined} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="sortbtn" onClick={() => { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(k === "keyword" || k === "category" ? 1 : -1); } }}>
        {label}{key === k ? (dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <div className="tablewrap">
      <table className="stack">
        <caption className="sr-only">Keyword counts this week versus last week</caption>
        <thead><tr>{th("keyword", "Keyword")}{th("category", "Category")}{th("current", "This week", true)}{th("previous", "Last week", true)}{th("change", "Change", true)}<th scope="col">Trend</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.category}|${r.keyword}`}>
              <td className="first mono">{r.keyword}{r.backfilled && <> <span className="tag">{r.data_status === "incomplete" ? "backfilled, no baseline" : "backfilled"}</span></>}</td>
              <td data-label="Category" className="small">{r.category}</td>
              <td className="num" data-label="This week">{r.current_count}</td>
              <td className="num" data-label="Last week">{r.previous_count}</td>
              <td className="num" data-label="Change">{changeText({ pct_change: r.pct_change, trend_label: r.trend_label })}</td>
              <td data-label="Trend"><TrendChip kind={labelToKind(r.trend_label)} label={r.trend_label} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
