// Drives the real Run now flow in a browser and captures the progress panel at each stage.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const pass = /^RUN_NOW_PASSCODE=(.*)$/m.exec(readFileSync(".env.local", "utf8"))![1];
const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Run now" }).click();
await page.locator(".runbox").screenshot({ path: "docs/screenshots/runnow-1-form.png" });
// wrong passcode first
await page.getByLabel("Run now passcode").fill("wrong");
await page.getByRole("button", { name: "Start run" }).click();
await page.getByText("That passcode is not right").first().waitFor({ timeout: 15000 });
await page.locator(".runbox").screenshot({ path: "docs/screenshots/runnow-2-error.png" });
await page.getByRole("button", { name: "Retry" }).click();
await page.getByLabel("Run now passcode").fill(pass);
await page.getByRole("button", { name: "Start run" }).click();
const seen: string[] = [];
const t0 = Date.now();
let shots = 0;
while (Date.now() - t0 < 110000) {
  const active = await page.locator(".stages li.active").first().textContent({ timeout: 500 }).catch(() => null);
  if (active && !seen.includes(active.trim())) { seen.push(active.trim()); await page.locator(".runbox").screenshot({ path: `docs/screenshots/runnow-3-stage-${++shots}.png` }); }
  if (await page.getByRole("heading", { name: "All done" }).count()) break;
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1200);
await page.locator(".runbox").screenshot({ path: "docs/screenshots/runnow-4-done.png" });
console.log("stages seen:", seen.join(" > "), "| finished in", Math.round((Date.now() - t0) / 1000), "s");
await browser.close();
