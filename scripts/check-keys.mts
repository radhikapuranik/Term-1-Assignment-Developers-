// Tests each key with a harmless call and reports "works" or "does not work, check X". Never prints a key value.
// Usage: node --env-file=.env.local --import tsx scripts/check-keys.mts   (or: npm run check-keys)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { listFlashModels, pickFlashModel } from "../src/lib/gemini";

const env = (k: string) => (process.env[k] ?? "").trim();
const say = (name: string, ok: boolean, detail: string) => console.log(`${ok ? "WORKS " : "FAILS "} ${name}: ${detail}`);

function setEnvLine(name: string, value: string) {
  const file = ".env.local";
  const lines = readFileSync(file, "utf8").split("\n");
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
  writeFileSync(file, lines.join("\n"));
}

// Supabase
if (!env("SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY")) say("Supabase", false, "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is empty in .env.local");
else {
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const t = await sb.from("topics").select("id", { count: "exact", head: true }).eq("active", true);
  if (t.error) say("Supabase", false, `${t.error.message}. Check the URL and service_role key, and that supabase/schema.sql was run in the SQL Editor`);
  else {
    say("Supabase", true, `connected, ${t.count} active topics found`);
    if (env("RECIPIENT_EMAIL")) {
      const u = await sb.from("settings").upsert({ key: "recipient_email", value: env("RECIPIENT_EMAIL") }, { onConflict: "key" });
      say("Recipient email", !u.error, u.error ? u.error.message : "saved to the settings table (change it any time in Supabase)");
    }
  }
}

// Gemini
if (!env("GEMINI_API_KEY")) say("Gemini", false, "GEMINI_API_KEY is empty in .env.local");
else {
  try {
    const { all } = await listFlashModels(env("GEMINI_API_KEY"));
    const pick = pickFlashModel(all);
    if (!pick) say("Gemini", false, `key works but no standard Flash model found. Models: ${all.slice(0, 15).join(", ")}`);
    else {
      setEnvLine("GEMINI_MODEL", pick);
      say("Gemini", true, `key works. Chose model "${pick}" (newest standard Flash that supports generateContent) and wrote it to GEMINI_MODEL`);
    }
  } catch (e) {
    say("Gemini", false, `${(e as Error).message}. Check GEMINI_API_KEY (aistudio.google.com -> Get API key)`);
  }
}

// Resend: listing domains is the harmless call. A sending-only key is refused there, which still proves it is a real key.
if (!env("RESEND_API_KEY")) say("Resend", false, "RESEND_API_KEY is empty in .env.local");
else {
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` } });
  const body = (await r.json().catch(() => ({}))) as { name?: string; message?: string };
  if (r.ok) say("Resend", true, "key works");
  else if (r.status === 401 && body.name === "restricted_api_key") say("Resend", true, "key is valid (sending-only key)");
  else say("Resend", false, `HTTP ${r.status} ${body.message ?? ""}. Check RESEND_API_KEY (resend.com -> API Keys)`);
}

// Stack Exchange
const se = await fetch(`https://api.stackexchange.com/2.3/info?site=stackoverflow${env("STACKEXCHANGE_KEY") ? `&key=${encodeURIComponent(env("STACKEXCHANGE_KEY"))}` : ""}`);
const seBody = (await se.json().catch(() => ({}))) as { quota_max?: number; error_message?: string };
if (!env("STACKEXCHANGE_KEY")) say("Stack Exchange", true, `no key set (works at low volume, quota ${seBody.quota_max ?? "?"} per day). A key is recommended`);
else say("Stack Exchange", se.ok && !!seBody.quota_max, se.ok ? `key works, quota ${seBody.quota_max} per day` : `${seBody.error_message ?? se.status}. Check STACKEXCHANGE_KEY`);
