import type { BriefCategory, BriefContent, BriefKeyword } from "./brief";
import { labelToKind } from "./trend";

export interface BackfillRow {
  level: "category" | "keyword";
  category_id: number;
  topic_id: number;
  current_count: number;
  previous_count: number;
  pct_change: number | null;
  trend_label: string;
  data_status: "complete" | "incomplete";
}
export interface CategoryRef { id: number; name: string; active: boolean }
export interface TopicRef { id: number; category_id: number; keyword: string; active: boolean; created_at: string }

/**
 * Makes a stored brief reflect the live topic list without changing any stored number:
 * 1. labels follow the permanent ids (a rename shows at once, history stays linked);
 * 2. keywords and categories added since the brief, and numbers backfilled after it, are shown with a "backfilled" flag.
 * `backfill` rows must be ordered oldest first, so a newer backfill replaces an older one.
 */
export function applyLiveTopics(content: BriefContent, categories: CategoryRef[], topics: TopicRef[], backfill: BackfillRow[], now = new Date()): BriefContent {
  const c: BriefContent = structuredClone(content);
  const catById = new Map(categories.map((x) => [x.id, x]));
  const nameToId = new Map(categories.map((x) => [x.name, x.id]));
  const topicById = new Map(topics.map((t) => [t.id, t]));

  for (const cat of c.categories) {
    cat.category_id ??= nameToId.get(cat.category) ?? 0; // briefs from before permanent ids
    const live = catById.get(cat.category_id);
    if (live) cat.category = live.name;
    for (const k of cat.keywords) {
      const t = topicById.get(k.topic_id);
      if (t) k.keyword = t.keyword;
    }
  }
  if (backfill.length === 0) return c;

  const catRows = new Map<number, BackfillRow>();
  const kwRows = new Map<number, BackfillRow>();
  for (const r of backfill) (r.level === "category" ? catRows : kwRows).set(r.level === "category" ? r.category_id : r.topic_id, r);

  const patch = (target: BriefCategory | BriefKeyword, r: BackfillRow) => {
    target.current_count = r.current_count;
    target.previous_count = r.previous_count;
    target.pct_change = r.pct_change;
    target.trend_label = r.trend_label;
    target.data_status = r.data_status;
    target.backfilled = true;
    if ("trend_kind" in target) target.trend_kind = labelToKind(r.trend_label);
  };
  const skeleton = (cat: CategoryRef): BriefCategory => ({
    category_id: cat.id, category: cat.name, current_count: 0, previous_count: 0, pct_change: null, trend_label: "", trend_kind: "insufficient",
    data_status: "complete", recently_added: true, headline: null, keywords: [], evidence: [], pain_points: [], opportunities: [],
  });
  const activeTopics = topics.filter((t) => t.active && catById.get(t.category_id)?.active);
  const activeCats = new Set(activeTopics.map((t) => t.category_id));

  for (const [categoryId, r] of catRows) {
    const live = catById.get(categoryId);
    if (!live || !activeCats.has(categoryId)) continue;
    let cat = c.categories.find((x) => x.category_id === categoryId);
    if (!cat) c.categories.push((cat = skeleton(live)));
    patch(cat, r);
    cat.recently_added = cat.recently_added || activeTopics.some((t) => t.category_id === categoryId && now.getTime() - new Date(t.created_at).getTime() < 14 * 86400000);
  }
  for (const [topicId, r] of kwRows) {
    const t = topicById.get(topicId);
    if (!t || !activeTopics.includes(t)) continue;
    const cat = c.categories.find((x) => x.category_id === t.category_id);
    if (!cat) continue;
    let k = cat.keywords.find((x) => x.topic_id === topicId);
    if (!k) cat.keywords.push((k = { topic_id: topicId, keyword: t.keyword, current_count: 0, previous_count: 0, pct_change: null, trend_label: "", data_status: "complete" }));
    patch(k, r);
  }
  c.categories.sort((a, b) => b.current_count - a.current_count || a.category.localeCompare(b.category));
  return c;
}
