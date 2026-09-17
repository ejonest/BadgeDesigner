/**
 * Captures real screenshots of the live plaque and trophy designers for the
 * Awards & Plaques hero cards, replacing the hand-drawn SVG mocks.
 *
 * Mirrors scripts/gf-shot-designer.mjs: drive the actual tool to a finished
 * looking design, then crop to the app frame using DOM geometry rather than
 * hardcoded pixels. Re-run when either designer's UI changes.
 *
 * Usage: node scripts/gf-shot-awards-tools.mjs [outDir]
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const outDir = process.argv[2] ?? "tmp-gf-shots";
const SCALE = 2;
const ORIGIN = "https://all-quality-design-tool.vercel.app";
const SHOP = "shop=gavelsfast.myshopify.com&storeUrl=gavelsfast.myshopify.com";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

/**
 * Bounds of everything actually painted. The app frame stretches to the full
 * viewport, so cropping to it leaves a band of empty background under the UI.
 */
async function frameBox(page) {
  return page.evaluate(() => {
    let top = Infinity;
    let bottom = 0;
    const vh = document.documentElement.clientHeight;
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width < 24 || b.height < 12) continue;
      // Full-height wrappers stretch past the UI and would re-add the gap.
      if (b.height > vh * 0.85) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      top = Math.min(top, b.top + window.scrollY);
      bottom = Math.max(bottom, b.bottom + window.scrollY);
    }
    if (!isFinite(top)) return null;
    const pad = 10;
    return {
      x: 0,
      y: Math.max(0, top - pad),
      w: document.documentElement.clientWidth,
      h: bottom - Math.max(0, top - pad) + pad,
    };
  });
}

/** Clicks by accessible text without tripping over sticky step headers. */
async function jsClick(page, pattern, label) {
  const hit = await page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const b = [...document.querySelectorAll("button")].find((el) =>
      re.test(
        [el.title, el.getAttribute("aria-label"), el.textContent]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
    if (b) b.click();
    return Boolean(b);
  }, pattern.source ?? pattern);
  console.log(`  ${label}: ${hit ? "clicked" : "NOT FOUND"}`);
  await page.waitForTimeout(1200);
  return hit;
}

async function crop(page, rawPath, outPath, maxHeight) {
  await page.screenshot({ path: rawPath, fullPage: true });
  const box = await frameBox(page);
  const meta = await sharp(rawPath).metadata();
  const left = box ? Math.max(0, Math.round(box.x * SCALE)) : 0;
  const top = box ? Math.max(0, Math.round(box.y * SCALE)) : 0;
  const width = box ? Math.round(box.w * SCALE) : meta.width;
  const height = Math.min(
    box ? Math.round(box.h * SCALE) : meta.height,
    Math.round(maxHeight * SCALE),
  );
  await sharp(rawPath)
    .extract({
      left,
      top,
      width: Math.min(width, meta.width - left),
      height: Math.min(height, meta.height - top),
    })
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(outPath);
  const m = await sharp(outPath).metadata();
  console.log(`${outPath} ${m.width}x${m.height}`);
}

async function newPage() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: SCALE,
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("  [page error]", m.text().slice(0, 120));
  });
  return page;
}

/** Dismiss the login/autosave reminder so it does not sit across the shot. */
async function dismissBanners(page) {
  for (const name of [/Dismiss reminder/i, /Dismiss/i, /^Close$/i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

// ---------------------------------------------------------------- plaque
{
  const page = await newPage();
  const url =
    `${ORIGIN}/plaque-designer?embedded=1&${SHOP}` +
    `&product=8268050530366&plaqueProductHandle=custom-plaque-design-1`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  // The preview stays empty until a layout and size are chosen.
  await jsClick(page, /Attached plate/, "plaque layout");
  await jsClick(page, /^\s*Medium\s*-\s*Frame size/, "plaque size");
  await jsClick(page, /Brushed Gold/, "plaque finish");

  // Lines 3 and 4 live in the text step, which is collapsed by default.
  await jsClick(page, /Enter your text/, "plaque text step");

  // Only two lines exist up front; the rest are added on demand.
  await jsClick(page, /Add Line/, "plaque add line 3");
  await jsClick(page, /Add Line/, "plaque add line 4");

  // Keep lines short: the plate clips wording wider than the engraving area.
  const values = [
    "ELIZA REED",
    "PRESIDING OFFICER",
    "FOR DEDICATED SERVICE",
    "BAR ASSOCIATION 2026",
  ];
  const textInputs = page.locator('input[type="text"]:visible');
  const count = await textInputs.count();
  for (let i = 0; i < Math.min(count, values.length); i++) {
    await textInputs.nth(i).fill(values[i]).catch(() => {});
    await page.waitForTimeout(250);
  }
  console.log(`  plaque: filled ${Math.min(count, values.length)} of ${count} lines`);

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(4000);

  await crop(
    page,
    join(outDir, "plaque-raw-full.png"),
    join(outDir, "gf-plaque-designer-shot.jpg"),
    1000,
  );
  await page.close();
}

// ---------------------------------------------------------------- trophy
{
  const page = await newPage();
  const url =
    `${ORIGIN}/trophy-designer?embedded=1&${SHOP}` +
    `&product=8265067397182&productHandle=custom-trophy`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  // Trophy is a step wizard: pick an award, then advance until the text fields appear.
  await jsClick(page, /Star Trophy/, "trophy style");
  const values = ["CHAMPIONS", "VARSITY SOCCER", "2026 SEASON"];
  // Trophy line fields carry no explicit type attribute.
  const inputs = page.locator(
    'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
  );

  for (let step = 0; step < 3; step++) {
    if ((await inputs.count()) > 0) break;
    await jsClick(page, /^Continue/, `trophy continue ${step + 1}`);
    await page.waitForTimeout(1500);
  }

  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, values.length); i++) {
    await inputs.nth(i).fill(values[i]).catch(() => {});
    await page.waitForTimeout(250);
  }
  console.log(`  trophy: filled ${Math.min(count, values.length)} of ${count} inputs`);

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(4000);

  await crop(
    page,
    join(outDir, "trophy-raw-full.png"),
    join(outDir, "gf-trophy-designer-shot.jpg"),
    1000,
  );
  await page.close();
}

await browser.close();
