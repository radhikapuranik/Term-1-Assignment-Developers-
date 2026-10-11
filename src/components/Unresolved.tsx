"use client";
import { useState } from "react";
import type { UnresolvedItem } from "@/lib/unresolved";
import { SOURCE_NAMES, SOURCES, type Source } from "@/lib/types";
import { formatIst } from "@/lib/format";
import { SourceBadge } from "./ui";

export function Unresolved({ items }: { items: UnresolvedItem[] }) {
  const [filter, setFilter] = useState<"all" | Source>("all");
  const shown = items.filter((i) => filter === "all" || i.source === filter);
  return (
    <>
      <div className="controls" style={{ marginBottom: 12 }} role="group" aria-label="Filter by source">
        {(["all", ...SOURCES] as const).map((s) => {
          const n = s === "all" ? items.length : items.filter((i) => i.source === s).length;
          return (
            <button key={s} type="button" className={`btn small${filter === s ? "" : " secondary"}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === "all" ? "All sources" : SOURCE_NAMES[s]} ({n})
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="note">Nothing flagged{filter === "all" ? "" : ` on ${SOURCE_NAMES[filter]}`} this week.</p>
      ) : (
        <ul className="unres">
          {shown.map((i) => (
            <li key={`${i.source}:${i.post_id}`}>
              <div className="title"><SourceBadge source={i.source} /><a href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a></div>
              <p className="reason">{i.reason}. Posted {formatIst(i.created_at, false)}. Checked {formatIst(i.fetched_at, false)}.</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
