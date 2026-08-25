/**
 * Screenshots the Gavels Fast homepage preview for visual review.
 *
 * Usage: node scripts/gf-shot-homepage.mjs [outDir]
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "tmp-gf-shots";
const url =
  "https://gavelsfast.myshopify.com/?preview_theme_id=142001537086&preview_key=";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 900 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });

  // Ella lazy-loads imagery on scroll; walk the page so everything paints.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 130));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  await page.screenshot({
    path: join(outDir, `gf-home-${name}-viewport.png`),
  });
  await page.screenshot({
    path: join(outDir, `gf-home-${name}-full.png`),
    fullPage: true,
  });

  const hero = page.locator(".gf-hero").first();
  if (await hero.count()) {
    await hero.screenshot({ path: join(outDir, `gf-home-${name}-hero.png`) });
  }

  console.log(`${name}: captured`);
  await page.close();
}

await browser.close();
console.log(`Screenshots written to ${outDir}`);
