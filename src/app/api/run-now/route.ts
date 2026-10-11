import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { sleep } from "@/lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const expected = process.env.RUN_NOW_PASSCODE;
  const given = req.headers.get("x-run-passcode") ?? "";
  if (!expected || !given || !safeEqual(given, expected)) {
    await sleep(600); // slows down guessing
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }
  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const recent = await db().from("runs").select("started_at").gte("started_at", since).order("started_at", { ascending: false }).limit(1);
  if (recent.data && recent.data.length > 0) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(recent.data[0].started_at as string).getTime())) / 1000);
    return NextResponse.json({ error: `A run started less than 5 minutes ago. Try again in about ${Math.max(wait, 1)} seconds.` }, { status: 429, headers: { "Retry-After": String(Math.max(wait, 1)) } });
  }
  const result = await runPipeline(new Date(), "manual");
  return NextResponse.json(result);
}
