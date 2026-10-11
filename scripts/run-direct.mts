// Runs the pipeline directly (no HTTP, no 5-minute Run now cooldown). Used for the failure-simulation demos.
// Usage: SIMULATE_FAIL=hn,gemini node --env-file=.env.local --import tsx scripts/run-direct.mts manual
//        node --env-file=.env.local --import tsx scripts/run-direct.mts scheduled [catchup]
import { runPipeline } from "../src/lib/pipeline";
import { scheduledAnchor } from "../src/lib/windows";

const type = process.argv[2] === "scheduled" ? "scheduled" : "manual";
const catchup = process.argv[3] === "catchup";
const anchor = type === "scheduled" ? scheduledAnchor(new Date()) : new Date();
const t = Date.now();
const r = await runPipeline(anchor, type, { catchup });
console.log(JSON.stringify({ type, catchup, anchor: anchor.toISOString(), simulate: process.env.SIMULATE_FAIL ?? "", ms: Date.now() - t, ...r }));
