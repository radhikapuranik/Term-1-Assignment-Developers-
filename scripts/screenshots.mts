// Takes desktop/phone, light/dark screenshots of the running app (default http://localhost:3000).
// Usage: node --import tsx scripts/screenshots.mts <state-name> [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const state = process.argv[2] ?? "data";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync("docs/screenshots", { recursive: true });
const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  for (const [name, w, h] of [["desktop", 1280, 900], ["phone", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `docs/screenshots/${state}-${name}-${scheme}.png`, fullPage: true });
    console.log(`${state} ${name} ${scheme}: horizontal overflow ${overflow}px`);
    await ctx.close();
  }
}
await browser.close();
