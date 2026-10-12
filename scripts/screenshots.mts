// Screenshots at 360, 768 and 1440 px, light and dark. Scrolls through the page first so scroll-triggered motion has played.
// Usage: node --import tsx scripts/screenshots.mts <state-name> [baseUrl] [--reduced] [--nojs] [--slow] [--only=1440]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const pos = args.filter((a) => !a.startsWith("--"));
const state = pos[0] ?? "data";
const base = pos[1] ?? "http://localhost:3000";
const reduced = flags.includes("--reduced");
const nojs = flags.includes("--nojs");
const slow = flags.includes("--slow");
const only = flags.find((f) => f.startsWith("--only="))?.split("=")[1];
mkdirSync("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]] as const) {
    if (only && String(w) !== only) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference", javaScriptEnabled: !nojs });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    if (slow) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    }
    await page.goto(base, { waitUntil: slow ? "domcontentloaded" : "networkidle", timeout: 90000 });
    if (!nojs && !slow) {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.round(h * 0.6)) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(120); }
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
    } else if (slow) await page.waitForTimeout(7000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const name = `${state}-${w}-${scheme}`;
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: !slow });
    console.log(`${name}: horizontal overflow ${overflow}px, console errors ${errors.length}${errors.length ? " " + JSON.stringify(errors.slice(0, 2)) : ""}`);
    await ctx.close();
  }
}
await browser.close();
