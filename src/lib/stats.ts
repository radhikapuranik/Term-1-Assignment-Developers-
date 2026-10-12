import { keywordMatches } from "./match";
import { trendFor } from "./trend";
import { windowOf, type Windows } from "./windows";
import type { RawPost, RequestOutcome, Settings, StatRow, Topic } from "./types";

export interface MatchRow {
  source: string;
  post_id: string;
  topic_id: number; // permanent keyword id
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

type TopicRef = Pick<Topic, "id" | "category_id" | "category" | "keyword">;

/** Matches every post against the given keywords, using only title and snippet. Returns keyword ids. */
export function verifyMatches(posts: RawPost[], topics: Pick<Topic, "id" | "keyword">[]): { source: string; post_id: string; topic_id: number }[] {
  const out: { source: string; post_id: string; topic_id: number }[] = [];
  for (const p of posts) {
    const text = `${p.title}\n${p.snippet ?? ""}`;
    for (const t of topics) {
      if (keywordMatches(text, t.keyword)) out.push({ source: p.source, post_id: p.post_id, topic_id: t.id });
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

/** Counts by permanent ids. A rename only changes a label; a move changes which category a keyword's posts count in. */
export function computeStats(args: {
  matches: MatchRow[];
  activeTopics: TopicRef[];
  windows: Windows;
  settings: Pick<Settings, "min_mentions" | "flat_threshold_pct">;
  outcomes: RequestOutcome[];
}): StatsResult {
  const { matches, activeTopics, windows, settings, outcomes } = args;
  const catOf = new Map(activeTopics.map((t) => [t.id, t.category_id]));
  const incompleteText = incompleteKeywords(outcomes, activeTopics.map((t) => t.keyword));

  type Slot = { current: Set<string>; previous: Set<string> };
  const cat = new Map<number, Slot>();
  const kw = new Map<number, Slot>();
  const overall: Slot = { current: new Set(), previous: new Set() };
  const slot = <K,>(m: Map<K, Slot>, k: K) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = { current: new Set(), previous: new Set() }));
    return s;
  };
  for (const t of activeTopics) {
    slot(cat, t.category_id);
    slot(kw, t.id);
  }
  for (const m of matches) {
    const categoryId = catOf.get(m.topic_id);
    if (categoryId === undefined) continue; // inactive keyword: hidden from counts, its past numbers stay in the history
    const w = windowOf(m.created_at, windows);
    if (!w) continue;
    const id = `${m.source}:${m.post_id}`;
    slot(cat, categoryId)[w].add(id);
    slot(kw, m.topic_id)[w].add(id);
    overall[w].add(id);
  }

  const rows: StatRow[] = [];
  const categoryIds = [...new Set(activeTopics.map((t) => t.category_id))];
  for (const id of categoryIds) {
    const topics = activeTopics.filter((t) => t.category_id === id);
    const s = slot(cat, id);
    rows.push(makeRow("category", id, 0, topics[0].category, "", s.current.size, s.previous.size, topics.some((t) => incompleteText.has(t.keyword)), settings));
  }
  for (const t of activeTopics) {
    const s = slot(kw, t.id);
    rows.push(makeRow("keyword", t.category_id, t.id, t.category, t.keyword, s.current.size, s.previous.size, incompleteText.has(t.keyword), settings));
  }
  return { rows, totals: { current: overall.current.size, previous: overall.previous.size } };
}

function makeRow(
  level: "category" | "keyword", categoryId: number, topicId: number, category: string, keyword: string,
  current: number, previous: number, incomplete: boolean, settings: Pick<Settings, "min_mentions" | "flat_threshold_pct">,
): StatRow {
  const t = trendFor({ current, previous, incomplete, minMentions: settings.min_mentions, flatThresholdPct: settings.flat_threshold_pct });
  return {
    level, category_id: categoryId, topic_id: topicId, category, keyword,
    current_count: current, previous_count: previous, pct_change: t.pct, trend_label: t.label,
    data_status: incomplete ? "incomplete" : "complete",
  };
}
