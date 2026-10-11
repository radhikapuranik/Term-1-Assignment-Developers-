export type Source = "hn" | "devto" | "so";
export const SOURCES: Source[] = ["hn", "devto", "so"];
export const SOURCE_NAMES: Record<Source, string> = {
  hn: "Hacker News",
  devto: "Dev.to",
  so: "Stack Overflow",
};

export interface RawPost {
  source: Source;
  post_id: string;
  title: string;
  snippet: string | null;
  url: string;
  created_at: string; // ISO
  comments: number | null;
  score: number | null;
  answer_count: number | null;
  has_accepted_answer: boolean | null;
  tags: string[] | null;
}

export interface Topic {
  id: number;
  category: string;
  keyword: string;
  active: boolean;
  created_at: string;
}

export interface Settings {
  recipient_email: string;
  min_mentions: number;
  flat_threshold_pct: number;
  devto_tags: string[];
  classify_cap: number;
}

export interface RequestOutcome {
  source: Source;
  target: string; // keyword (hn, so) or tag (devto)
  ok: boolean;
  count: number;
  retries: number;
  error?: string;
}

export type TrendKind =
  | "incomplete"
  | "zero"
  | "insufficient"
  | "new"
  | "dropped"
  | "up"
  | "down"
  | "flat";

export interface StatRow {
  level: "category" | "keyword";
  category: string;
  keyword: string;
  current_count: number;
  previous_count: number;
  pct_change: number | null;
  trend_label: string;
  data_status: "complete" | "incomplete";
}

export interface PostRow extends RawPost {
  fetched_at: string;
  relevant: boolean | null;
  sentiment: string | null;
  pain_point: string | null;
  seeking_help: boolean | null;
  classified_at: string | null;
}

export const postKey = (source: string, postId: string) => `${source}:${postId}`;
