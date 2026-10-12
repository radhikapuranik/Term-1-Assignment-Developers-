import { q } from "./db";

export class AdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface AdminTopic { id: number; keyword: string; active: boolean; created_at: string }
export interface AdminCategory { id: number; name: string; active: boolean; topics: AdminTopic[] }

export function cleanLabel(raw: unknown, what: string): string {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (s.length < 2) throw new AdminError(`The ${what} needs at least 2 characters.`);
  if (s.length > 80) throw new AdminError(`The ${what} can be at most 80 characters.`);
  return s;
}

export async function listAdmin(): Promise<AdminCategory[]> {
  const cats = await q<{ id: number; name: string; active: boolean }>("select id, name, active from categories order by active desc, name");
  const topics = await q<AdminTopic & { category_id: number }>("select id, category_id, keyword, active, created_at from topics order by active desc, id");
  return cats.map((c) => ({ ...c, id: Number(c.id), topics: topics.filter((t) => Number(t.category_id) === Number(c.id)).map((t) => ({ id: Number(t.id), keyword: t.keyword, active: t.active, created_at: t.created_at })) }));
}

async function categoryExists(id: number): Promise<{ id: number; name: string; active: boolean }> {
  const r = (await q<{ id: number; name: string; active: boolean }>("select id, name, active from categories where id = $1", [id]))[0];
  if (!r) throw new AdminError("That category does not exist.", 404);
  return r;
}
export async function topicRow(id: number): Promise<{ id: number; category_id: number; keyword: string; active: boolean }> {
  const r = (await q<{ id: number; category_id: number; keyword: string; active: boolean }>("select id, category_id, keyword, active from topics where id = $1", [id]))[0];
  if (!r) throw new AdminError("That keyword does not exist.", 404);
  return { ...r, id: Number(r.id), category_id: Number(r.category_id) };
}

async function assertFreeCategoryName(name: string, exceptId = 0) {
  const dup = await q("select 1 from categories where lower(name) = lower($1) and id <> $2", [name, exceptId]);
  if (dup.length) throw new AdminError(`A category called "${name}" already exists.`, 409);
}
async function assertFreeKeyword(categoryId: number, keyword: string, exceptId = 0) {
  const dup = await q("select 1 from topics where category_id = $1 and lower(keyword) = lower($2) and id <> $3", [categoryId, keyword, exceptId]);
  if (dup.length) throw new AdminError(`"${keyword}" is already a keyword in that category.`, 409);
}

export async function addCategory(rawName: unknown): Promise<number> {
  const name = cleanLabel(rawName, "category name");
  await assertFreeCategoryName(name);
  return Number((await q<{ id: number }>("insert into categories (name) values ($1) returning id", [name]))[0].id);
}
export async function renameCategory(id: number, rawName: unknown): Promise<string> {
  const name = cleanLabel(rawName, "category name");
  await categoryExists(id);
  await assertFreeCategoryName(name, id);
  await q("update categories set name = $2 where id = $1", [id, name]);
  return name;
}
export async function setCategoryActive(id: number, active: boolean): Promise<void> {
  await categoryExists(id);
  await q("update categories set active = $2 where id = $1", [id, active]);
}
export async function addKeyword(categoryId: number, rawKeyword: unknown): Promise<number> {
  const keyword = cleanLabel(rawKeyword, "keyword");
  const c = await categoryExists(categoryId);
  if (!c.active) throw new AdminError("Switch the category on before adding keywords to it.");
  await assertFreeKeyword(categoryId, keyword);
  return Number((await q<{ id: number }>("insert into topics (category_id, keyword) values ($1, $2) returning id", [categoryId, keyword]))[0].id);
}
/** Changes the text. The old matches belong to the old text, so they are removed and the keyword is matched again from scratch. */
export async function editKeyword(id: number, rawKeyword: unknown): Promise<{ changed: boolean; keyword: string; active: boolean }> {
  const keyword = cleanLabel(rawKeyword, "keyword");
  const t = await topicRow(id);
  if (t.keyword === keyword) return { changed: false, keyword, active: t.active };
  await assertFreeKeyword(t.category_id, keyword, id);
  await q("delete from post_matches where topic_id = $1", [id]);
  await q("update topics set keyword = $2 where id = $1", [id, keyword]);
  return { changed: true, keyword, active: t.active };
}
export async function moveKeyword(id: number, categoryId: number): Promise<{ keyword: string; to: string }> {
  const t = await topicRow(id);
  const c = await categoryExists(categoryId);
  if (t.category_id === categoryId) throw new AdminError("It is already in that category.");
  await assertFreeKeyword(categoryId, t.keyword, id);
  await q("update topics set category_id = $2 where id = $1", [id, categoryId]);
  return { keyword: t.keyword, to: c.name };
}
export async function setKeywordActive(id: number, active: boolean): Promise<string> {
  const t = await topicRow(id);
  await q("update topics set active = $2 where id = $1", [id, active]);
  return t.keyword;
}
