import { NextResponse } from "next/server";
import { bearerOk } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";
import { scheduledAnchor } from "@/lib/windows";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catchup = new URL(req.url).searchParams.get("catchup") === "1";
  // Same anchor for the primary run, in-code retries and the catch-up run on the same Friday.
  const anchor = scheduledAnchor(new Date());
  const result = await runPipeline(anchor, "scheduled", { catchup });
  return NextResponse.json({ anchor: anchor.toISOString(), catchup, ...result });
}
