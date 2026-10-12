// Keyboard-only walkthrough and axe audit (WCAG A/AA incl. contrast) in light and dark.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch();
let failures = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) failures++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " " + extra : ""}`); };

// ---- keyboard walkthrough ----
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })).newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  ok("first Tab reaches the skip link", await page.evaluate(() => document.activeElement?.classList.contains("skip") ?? false));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  ok("skip link jumps to main content", (await page.evaluate(() => location.hash)) === "#main");

  // every focusable element shows a visible focus ring
  const focusables = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, [tabindex='0']")].filter((e) => e.offsetParent !== null).length);
  let noRing = 0, steps = 0;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < Math.min(focusables, 60); i++) {
    await page.keyboard.press("Tab");
    steps++;
    const ring = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });
    if (!ring) noRing++;
  }
  ok(`focus ring visible on ${steps} tab stops`, noRing === 0, noRing ? `(${noRing} without)` : "");

  // theme toggle by keyboard
  await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).focus();
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.keyboard.press("Enter");
  const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("theme toggles from the keyboard", before !== after, `(${before} -> ${after})`);
  await page.keyboard.press("Enter"); // back

  // table row expand with Enter, and it exposes aria-expanded
  const rowBtn = page.locator("#pain tbody .rowbtn").first();
  await rowBtn.focus();
  await page.keyboard.press("Enter");
  ok("pain row expands with Enter", (await rowBtn.getAttribute("aria-expanded")) === "true" && (await page.locator("#pain tr.detail").count()) === 1);
  await page.keyboard.press("Enter");

  // number tooltip on focus
  const tip = page.locator("#pain .numtip").first();
  await tip.focus();
  ok("number explains itself on keyboard focus", (await page.getByRole("tooltip").count()) === 1, `("${(await page.getByRole("tooltip").first().innerText().catch(() => "")).slice(0, 60)}...")`);
  await page.keyboard.press("Escape");
  ok("Escape closes the tooltip", (await page.getByRole("tooltip").count()) === 0);

  // copy button
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.getByRole("button", { name: "Copy brief as text" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  ok("copy button confirms with 'Copied'", (await page.locator("#summary [role=status]").first().innerText()).trim() === "Copied");

  // Run now by keyboard
  await page.getByRole("button", { name: "Run now" }).focus();
  await page.keyboard.press("Enter");
  ok("Run now opens a passcode field by keyboard", await page.evaluate(() => document.activeElement?.id === "passcode"));

  // sticky nav + scroll-spy via keyboard
  await page.locator(".snav-links a", { hasText: "Keywords" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  ok("nav link moves to its section and scroll-spy follows", (await page.locator('.snav-links a[aria-current="true"]').innerText()) === "Keywords");
  await page.close();
}

// ---- axe (contrast, names, roles) in both themes, desktop and phone ----
for (const [scheme, w] of [["light", 1440], ["dark", 1440], ["light", 360], ["dark", 360]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const contrast = res.violations.find((v) => v.id === "color-contrast");
  ok(`axe ${scheme} ${w}px: ${res.violations.length} violations`, res.violations.length === 0, res.violations.map((v) => `${v.id}(${v.nodes.length})`).join(","));
  if (contrast) for (const n of contrast.nodes.slice(0, 5)) console.log("   ", n.target.join(" "), n.any[0]?.message?.slice(0, 120));
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
