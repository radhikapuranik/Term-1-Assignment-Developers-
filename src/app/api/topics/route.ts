import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/auth";
import { sleep } from "@/lib/http";
import { backfillTopic, type BackfillResult } from "@/lib/backfill";
import { AdminError, addCategory, addKeyword, editKeyword, listAdmin, moveKeyword, renameCategory, setCategoryActive, setKeywordActive } from "@/lib/topics-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function authorised(req: Request): Promise<NextResponse | null> {
  const expected = process.env.RUN_NOW_PASSCODE;
  const given = req.headers.get("x-run-passcode") ?? "";
  if (!expected || !given || !safeEqual(given, expected)) {
    await sleep(600); // slows down guessing
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const denied = await authorised(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ categories: await listAdmin() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new AdminError("Missing or invalid id.");
  return n;
};

function backfillText(b: BackfillResult): string {
  const nums = b.no_baseline
    ? `No baseline yet: a source did not respond (${b.sources.filter((s) => !s.ok).map((s) => `${s.source} ${s.message}`).join("; ")}).`
    : `Backfilled: ${b.current_count} this week, ${b.previous_count} last week${b.pct_change !== null ? ` (${b.pct_change > 0 ? "+" : ""}${b.pct_change}%)` : ""}, trend: ${b.trend_label}.`;
  return nums;
}

export async function POST(req: Request) {
  const denied = await authorised(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let message = "";
    let backfill: BackfillResult | null = null;
    switch (body.action) {
      case "addCategory": {
        const id = await addCategory(body.name);
        message = `Category "${String(body.name).trim()}" added.`;
        if (typeof body.keyword === "string" && body.keyword.trim()) {
          const topicId = await addKeyword(id, body.keyword);
          backfill = await backfillTopic(topicId);
          message += ` Keyword "${backfill.keyword}" added. ${backfillText(backfill)}`;
        } else message += " Add a keyword to it so it can be counted.";
        break;
      }
      case "renameCategory": {
        const name = await renameCategory(num(body.id), body.name);
        message = `Renamed to "${name}". Past numbers stay linked to it.`;
        break;
      }
      case "setCategoryActive": {
        await setCategoryActive(num(body.id), body.active === true);
        message = body.active === true ? "Category switched on. It is counted again from the next run, and its past numbers are kept." : "Category switched off. Future runs skip it; its past numbers are kept.";
        break;
      }
      case "addKeyword": {
        const topicId = await addKeyword(num(body.categoryId), body.keyword);
        backfill = await backfillTopic(topicId);
        message = `Keyword "${backfill.keyword}" added. ${backfillText(backfill)}`;
        break;
      }
      case "editKeyword": {
        const r = await editKeyword(num(body.id), body.keyword);
        if (!r.changed) message = "Nothing changed.";
        else if (!r.active) message = `Keyword renamed to "${r.keyword}". It is switched off, so it will be matched when you switch it on and run.`;
        else {
          backfill = await backfillTopic(num(body.id));
          message = `Keyword text changed to "${r.keyword}" and matched again from scratch. ${backfillText(backfill)} Past runs keep their old numbers.`;
        }
        break;
      }
      case "moveKeyword": {
        const r = await moveKeyword(num(body.id), num(body.categoryId));
        message = `"${r.keyword}" moved to "${r.to}". The dashboard shows it there from the next run; its past numbers stay linked.`;
        break;
      }
      case "setKeywordActive": {
        const kw = await setKeywordActive(num(body.id), body.active === true);
        message = body.active === true ? `"${kw}" switched on. It is counted from the next run; nothing is filled in for the time it was off.` : `"${kw}" switched off. Future runs skip it; its past numbers are kept.`;
        break;
      }
      default:
        throw new AdminError("Unknown action.");
    }
    revalidatePath("/");
    return NextResponse.json({ ok: true, message, backfill, categories: await listAdmin() });
  } catch (e) {
    if (e instanceof AdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(JSON.stringify({ level: "error", stage: "topics", message: (e as Error).message }));
    return NextResponse.json({ error: `Something went wrong: ${(e as Error).message}` }, { status: 500 });
  }
}
