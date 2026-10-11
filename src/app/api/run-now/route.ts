import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { recentRunSince } from "@/lib/db";
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
  const last = await recentRunSince(new Date(Date.now() - COOLDOWN_MS));
  if (last) {
    const wait = Math.max(Math.ceil((COOLDOWN_MS - (Date.now() - new Date(last).getTime())) / 1000), 1);
    return NextResponse.json({ error: `A run started less than 5 minutes ago. Try again in about ${wait} seconds.` }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  const result = await runPipeline(new Date(), "manual");
  return NextResponse.json(result);
}
