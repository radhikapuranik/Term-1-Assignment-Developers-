import { SOURCE_NAMES } from "./types";
import { changeText, type BriefContent } from "./brief";
import { formatIst, weekEndingLabel } from "./format";
import { labelToKind } from "./trend";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailSubject(anchor: string): string {
  return `Developer Community Pulse: week ending ${weekEndingLabel(anchor)} IST`;
}

const TREND_COLOR: Record<string, string> = {
  up: "#C2410C", down: "#15803D", flat: "#64748B", new: "#0369A1", dropped: "#15803D", incomplete: "#A16207",
};

export function renderEmailHtml(b: BriefContent, dashboardUrl: string, runPath?: string): string {
  const td = "padding:6px 10px;border-bottom:1px solid #E3E7ED;font-size:14px;";
  const th = "padding:6px 10px;border-bottom:2px solid #0F1720;font-size:12px;text-align:left;color:#5B6675;font-weight:600;";
  const a = (href: string, text: string) => `<a href="${esc(href)}" style="color:#2457D6">${esc(text)}</a>`;
  const out: string[] = [];
  out.push(`<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1720;max-width:720px;margin:0 auto;padding:16px;line-height:1.5">`);
  out.push(`<h1 style="font-size:22px;margin:0 0 4px">Developer Community Pulse</h1>`);
  out.push(`<p style="margin:0 0 16px;color:#5B6675;font-size:14px">${esc(b.window_sentence)}</p>`);
  const banners = [...b.data_quality];
  if (b.ai.status === "unavailable") banners.unshift("AI analysis unavailable this week. Counts, trends and links below come straight from the database.");
  if (banners.length) {
    out.push(`<div style="border:1px solid #A16207;background:#FEF9E7;padding:10px 12px;margin:0 0 16px;font-size:14px"><strong>Data quality</strong><ul style="margin:6px 0 0 18px;padding:0">${banners.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`);
  }
  out.push(`<p style="font-size:14px;margin:0 0 16px"><strong>${b.totals.current}</strong> unique posts this week, <strong>${b.totals.previous}</strong> the week before.</p>`);
  if (b.executive_summary) {
    out.push(`<h2 style="font-size:16px;margin:16px 0 6px">Executive summary</h2><p style="margin:0 0 4px;font-size:15px">${esc(b.executive_summary)}</p><p style="margin:0 0 16px;font-size:12px;color:#5B6675">Written by Gemini. All numbers and links come from the database.</p>`);
  }
  for (const c of b.categories) {
    const color = TREND_COLOR[c.trend_kind] ?? "#5B6675";
    out.push(`<h2 style="font-size:16px;margin:24px 0 6px">${esc(c.category)}${c.recently_added ? ' <span style="font-size:12px;color:#0369A1">(recently added)</span>' : ""}</h2>`);
    if (c.headline) out.push(`<p style="margin:0 0 8px;font-size:14px">${esc(c.headline)}</p>`);
    out.push(`<table style="border-collapse:collapse;width:100%"><thead><tr><th style="${th}">Topic</th><th style="${th}">This week</th><th style="${th}">Last week</th><th style="${th}">Change</th><th style="${th}">Trend</th></tr></thead><tbody>`);
    out.push(`<tr><td style="${td}"><strong>All of category</strong></td><td style="${td}">${c.current_count}</td><td style="${td}">${c.previous_count}</td><td style="${td}">${esc(changeText(c))}</td><td style="${td}color:${color}"><strong>${esc(c.trend_label)}</strong></td></tr>`);
    for (const k of c.keywords) {
      const kc = TREND_COLOR[labelToKind(k.trend_label)] ?? "#5B6675";
      out.push(`<tr><td style="${td}">${esc(k.keyword)}</td><td style="${td}">${k.current_count}</td><td style="${td}">${k.previous_count}</td><td style="${td}">${esc(changeText({ pct_change: k.pct_change, trend_label: k.trend_label }))}</td><td style="${td}color:${kc}">${esc(k.trend_label)}</td></tr>`);
    }
    out.push(`</tbody></table>`);
    if (c.pain_points.length) {
      out.push(`<p style="margin:10px 0 2px;font-size:13px;font-weight:600">Top pain points</p><ul style="margin:0 0 0 18px;padding:0;font-size:14px">`);
      for (const p of c.pain_points) out.push(`<li>${esc(p.label)} ${p.evidence.map((e) => `[${esc(SOURCE_NAMES[e.source])}: ${a(e.url, e.title)}]`).join(" ")}</li>`);
      out.push(`</ul>`);
    }
    if (c.opportunities.length) {
      out.push(`<p style="margin:10px 0 2px;font-size:13px;font-weight:600">Product opportunities</p><ul style="margin:0 0 0 18px;padding:0;font-size:14px">`);
      for (const p of c.opportunities) out.push(`<li>${esc(p.text)} ${p.evidence.map((e) => `[${esc(SOURCE_NAMES[e.source])}: ${a(e.url, e.title)}]`).join(" ")}</li>`);
      out.push(`</ul>`);
    }
    if (!c.pain_points.length && c.evidence.length) {
      out.push(`<p style="margin:10px 0 2px;font-size:13px;font-weight:600">Most discussed this week</p><ul style="margin:0 0 0 18px;padding:0;font-size:14px">${c.evidence.slice(0, 3).map((e) => `<li>[${esc(SOURCE_NAMES[e.source])}] ${a(e.url, e.title)}</li>`).join("")}</ul>`);
    }
  }
  out.push(`<h2 style="font-size:16px;margin:28px 0 6px">Potentially unresolved discussions</h2>`);
  out.push(`<p style="margin:0 0 6px;font-size:12px;color:#5B6675">Based on replies and answers at the time we looked. Open the link to verify.</p>`);
  if (b.unresolved.length === 0) out.push(`<p style="font-size:14px">None found this week.</p>`);
  else {
    out.push(`<ul style="margin:0 0 0 18px;padding:0;font-size:14px">`);
    for (const u of b.unresolved.slice(0, 15)) out.push(`<li>[${esc(SOURCE_NAMES[u.source])}] ${a(u.url, u.title)}<br><span style="color:#5B6675;font-size:12px">${esc(u.reason)}. Posted ${esc(formatIst(u.created_at, false))}, checked ${esc(formatIst(u.fetched_at, false))}.</span></li>`);
    out.push(`</ul>`);
  }
  out.push(`<p style="margin:28px 0 0;font-size:14px">${a(runPath ? `${dashboardUrl}${runPath}` : dashboardUrl, "Open the full dashboard")}</p>`);
  out.push(`</div>`);
  return out.join("\n");
}

export function renderText(b: BriefContent, dashboardUrl: string): string {
  const L: string[] = [];
  L.push("DEVELOPER COMMUNITY PULSE", b.window_sentence, "");
  if (b.ai.status === "unavailable") L.push("AI analysis unavailable this week. Counts, trends and links come from the database.", "");
  for (const n of b.data_quality) L.push(`DATA QUALITY: ${n}`);
  if (b.data_quality.length) L.push("");
  L.push(`Unique posts: ${b.totals.current} this week, ${b.totals.previous} last week`, "");
  if (b.executive_summary) L.push("EXECUTIVE SUMMARY", b.executive_summary, "(Written by Gemini. All numbers and links come from the database.)", "");
  for (const c of b.categories) {
    L.push(`${c.category.toUpperCase()}${c.recently_added ? " (recently added)" : ""}`);
    L.push(`  All: this week ${c.current_count}, last week ${c.previous_count}, change ${changeText(c)}, ${c.trend_label}`);
    for (const k of c.keywords) L.push(`  - ${k.keyword}: ${k.current_count} vs ${k.previous_count} (${k.trend_label})`);
    if (c.headline) L.push(`  ${c.headline}`);
    for (const p of c.pain_points) L.push(`  Pain point: ${p.label}`, ...p.evidence.map((e) => `    ${SOURCE_NAMES[e.source]}: ${e.title} ${e.url}`));
    for (const p of c.opportunities) L.push(`  Opportunity: ${p.text}`, ...p.evidence.map((e) => `    ${SOURCE_NAMES[e.source]}: ${e.title} ${e.url}`));
    L.push("");
  }
  L.push("POTENTIALLY UNRESOLVED DISCUSSIONS (based on replies and answers at the time we looked; open the link to verify)");
  if (!b.unresolved.length) L.push("  None found this week.");
  for (const u of b.unresolved.slice(0, 15)) L.push(`  - [${SOURCE_NAMES[u.source]}] ${u.title}`, `    ${u.reason}. Posted ${formatIst(u.created_at, false)}, checked ${formatIst(u.fetched_at, false)}.`, `    ${u.url}`);
  L.push("", `Dashboard: ${dashboardUrl}`);
  return L.join("\n");
}

export function renderFailureText(reason: string, dashboardUrl: string): string {
  return `Developer Community Pulse: data collection failed.\n\nNo brief was produced this week because none of the three sources (Hacker News, Dev.to, Stack Overflow) could be reached.\n\nDetails: ${reason}\n\nThe run will be retried by the catch-up job. Dashboard: ${dashboardUrl}`;
}
