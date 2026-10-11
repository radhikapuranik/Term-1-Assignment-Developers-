import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostRow, Settings, Topic } from "./types";
import type { MatchRow } from "./stats";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

const PAGE = 1000;

/** Reads every row of a query by paging through it (Supabase returns at most 1000 rows per call). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadConfig(): Promise<{ topics: Topic[]; settings: Settings }> {
  const sb = db();
  const t = await sb.from("topics").select("*").eq("active", true).order("category").order("id");
  if (t.error) throw new Error(`topics: ${t.error.message}`);
  const s = await sb.from("settings").select("key,value");
  if (s.error) throw new Error(`settings: ${s.error.message}`);
  const map = Object.fromEntries((s.data ?? []).map((r) => [r.key as string, r.value]));
  const settings: Settings = {
    recipient_email: String(map.recipient_email ?? ""),
    min_mentions: Number(map.min_mentions ?? 5),
    flat_threshold_pct: Number(map.flat_threshold_pct ?? 10),
    devto_tags: Array.isArray(map.devto_tags) ? (map.devto_tags as string[]) : [],
    classify_cap: Number(map.classify_cap ?? 120),
  };
  return { topics: (t.data ?? []) as Topic[], settings };
}

export async function loadWindowData(from: Date, to: Date): Promise<{ posts: PostRow[]; matches: MatchRow[] }> {
  const sb = db();
  const posts = await fetchAll<PostRow>((a, b) =>
    sb.from("posts").select("*").gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("source").order("post_id").range(a, b),
  );
  const raw = await fetchAll<{ source: string; post_id: string; category: string; keyword: string; posts: { created_at: string } | { created_at: string }[] }>((a, b) =>
    sb
      .from("post_matches")
      .select("source,post_id,category,keyword,posts!inner(created_at)")
      .gte("posts.created_at", from.toISOString())
      .lt("posts.created_at", to.toISOString())
      .order("source").order("post_id").order("category").order("keyword")
      .range(a, b),
  );
  const matches: MatchRow[] = raw.map((r) => ({
    source: r.source,
    post_id: r.post_id,
    category: r.category,
    keyword: r.keyword,
    created_at: (Array.isArray(r.posts) ? r.posts[0] : r.posts).created_at,
  }));
  return { posts, matches };
}
