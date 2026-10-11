import { keywordMatches } from "./match";
import { trendFor } from "./trend";
import { windowOf, type Windows } from "./windows";
import type { RawPost, RequestOutcome, Settings, StatRow, Topic } from "./types";

export interface MatchRow {
  source: string;
  post_id: string;
  category: string;
  keyword: string;
  created_at: string; // post creation time at the source
}

export interface Totals {
  current: number;
  previous: number;
}

export interface StatsResult {
  rows: StatRow[];
  totals: Totals; // each post counted once, however many categories it matches
}

/** Matches every post against every active keyword, using only title and snippet. */
export function verifyMatches(
  posts: RawPost[],
  topics: Pick<Topic, "category" | "keyword">[],
): { source: string; post_id: string; category: string; keyword: string }[] {
  const out: { source: string; post_id: string; category: string; keyword: string }[] = [];
  for (const p of posts) {
    const text = `${p.title}\n${p.snippet ?? ""}`;
    for (const t of topics) {
      if (keywordMatches(text, t.keyword)) {
        out.push({ source: p.source, post_id: p.post_id, category: t.category, keyword: t.keyword });
      }
    }
  }
  return out;
}

/**
 * A category or keyword is incomplete when any request that feeds it failed:
 * a failed Hacker News or Stack Overflow request for one of its keywords, or any failed Dev.to tag.
 */
export function incompleteKeywords(outcomes: RequestOutcome[], keywords: string[]): Set<string> {
  const devtoFailed = outcomes.some((o) => o.source === "devto" && !o.ok);
  const failedKw = new Set(outcomes.filter((o) => o.source !== "devto" && !o.ok).map((o) => o.target));
  return new Set(keywords.filter((k) => devtoFailed || failedKw.has(k)));
}

export function computeStats(args: {
  matches: MatchRow[];
  activeTopics: Pick<Topic, "category" | "keyword">[];
  windows: Windows;
  settings: Pick<Settings, "min_mentions" | "flat_threshold_pct">;
  outcomes: RequestOutcome[];
}): StatsResult {
  const { matches, activeTopics, windows, settings, outcomes } = args;
  const active = new Set(activeTopics.map((t) => `${t.category}\u0000${t.keyword}`));
  const incomplete = incompleteKeywords(outcomes, activeTopics.map((t) => t.keyword));

  const cat = new Map<string, { current: Set<string>; previous: Set<string> }>();
  const kw = new Map<string, { current: Set<string>; previous: Set<string> }>();
  const overall = { current: new Set<string>(), previous: new Set<string>() };
  const slot = (m: Map<string, { current: Set<string>; previous: Set<string> }>, k: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = { current: new Set(), previous: new Set() }));
    return s;
  };

  for (const t of activeTopics) {
    slot(cat, t.category);
    slot(kw, `${t.category}\u0000${t.keyword}`);
  }
  for (const m of matches) {
    if (!active.has(`${m.category}\u0000${m.keyword}`)) continue;
    const w = windowOf(m.created_at, windows);
    if (!w) continue;
    const id = `${m.source}:${m.post_id}`;
    slot(cat, m.category)[w].add(id);
    slot(kw, `${m.category}\u0000${m.keyword}`)[w].add(id);
    overall[w].add(id);
  }

  const rows: StatRow[] = [];
  const categories = [...new Set(activeTopics.map((t) => t.category))];
  for (const c of categories) {
    const s = slot(cat, c);
    const topicKws = activeTopics.filter((t) => t.category === c).map((t) => t.keyword);
    const inc = topicKws.some((k) => incomplete.has(k));
    rows.push(makeRow("category", c, "", s.current.size, s.previous.size, inc, settings));
  }
  for (const t of activeTopics) {
    const s = slot(kw, `${t.category}\u0000${t.keyword}`);
    rows.push(
      makeRow("keyword", t.category, t.keyword, s.current.size, s.previous.size, incomplete.has(t.keyword), settings),
    );
  }
  return { rows, totals: { current: overall.current.size, previous: overall.previous.size } };
}

function makeRow(
  level: "category" | "keyword",
  category: string,
  keyword: string,
  current: number,
  previous: number,
  incomplete: boolean,
  settings: Pick<Settings, "min_mentions" | "flat_threshold_pct">,
): StatRow {
  const t = trendFor({
    current,
    previous,
    incomplete,
    minMentions: settings.min_mentions,
    flatThresholdPct: settings.flat_threshold_pct,
  });
  return {
    level,
    category,
    keyword,
    current_count: current,
    previous_count: previous,
    pct_change: t.pct,
    trend_label: t.label,
    data_status: incomplete ? "incomplete" : "complete",
  };
}
