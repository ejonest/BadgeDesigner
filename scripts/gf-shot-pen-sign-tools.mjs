/**
 * Captures real screenshots of the live pen and desk sign designers for the
 * "Personalized pens and desk signs" hero cards.
 *
 * Mirrors scripts/gf-shot-awards-tools.mjs: drive the actual tool to a finished
 * looking design, then crop to the app frame using DOM geometry rather than
 * hardcoded pixels. Re-run when either designer's UI changes.
 *
 * Usage: node scripts/gf-shot-pen-sign-tools.mjs [outDir]
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const outDir = process.argv[2] ?? "tmp-gf-pen-sign-shots";
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
  // Step panels scroll themselves into view, which leaves the tool's own
  // heading above the fullPage capture area.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollTop) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(800);
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
  // The desk sign autosave notice uses a bare icon button with no label.
  await page.evaluate(() => {
    const banner = [...document.querySelectorAll("div")].find((el) =>
      /Cloud autosave is off until you log in/i.test(el.textContent || ""),
    );
    const close = banner?.querySelector("button");
    if (close) close.click();
  });
  await page.waitForTimeout(400);
}

async function fillVisible(page, selector, values, label) {
  const inputs = page.locator(selector);
  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, values.length); i++) {
    await inputs.nth(i).fill(values[i]).catch(() => {});
    await page.waitForTimeout(300);
  }
  console.log(`  ${label}: filled ${Math.min(count, values.length)} of ${count} inputs`);
}

// ------------------------------------------------------------------ pen
{
  const page = await newPage();
  const url = `${ORIGIN}/pen-designer?embedded=1&${SHOP}&product=8255848480830`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  // Step 1 preselects the only gift set; step 2 is where the engraving is typed.
  await jsClick(page, /^Continue/, "pen continue to cap");
  await fillVisible(
    page,
    'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
    ["Hon. Eliza Reed"],
    "pen cap",
  );

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(4000);

  await crop(
    page,
    join(outDir, "pen-raw-full.png"),
    join(outDir, "gf-pen-designer-shot.jpg"),
    1000,
  );
  await page.close();
}

// ------------------------------------------------------------ desk sign
{
  const page = await newPage();
  const url =
    `${ORIGIN}/desk-sign-designer?embedded=1&${SHOP}` +
    `&product=8268717064254&deskSignProductHandle=custom-desk-sign`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  // The preview stays empty until a material, size, and finish are chosen.
  await jsClick(page, /Piano Finished Rosewood/, "sign material");
  await jsClick(page, /2×10|2x10/, "sign size");
  await jsClick(page, /Brushed Gold/, "sign finish");

  // Open the text step last so the finished shot shows the wording fields.
  await jsClick(page, /Enter your text/, "sign text step");
  await fillVisible(
    page,
    'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
    ["Eliza Reed", "Presiding Officer"],
    "sign text",
  );
  await page.waitForTimeout(4000);

  await crop(
    page,
    join(outDir, "sign-raw-full.png"),
    join(outDir, "gf-desk-sign-designer-shot.jpg"),
    1000,
  );
  await page.close();
}

await browser.close();
