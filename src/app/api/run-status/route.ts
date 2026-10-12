import { NextResponse } from "next/server";
import { latestRunStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public, read-only progress of the newest run: status and stage only (no errors, no data). */
export async function GET() {
  try {
    const r = await latestRunStatus();
    return NextResponse.json(r ?? { id: null, status: "none", stage: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not read run status." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
