import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const outDir = process.argv[2] ?? "tmp-sbl-shots";
const SCALE = 2;
const ORIGIN = "https://all-quality-design-tool.vercel.app";
const SHOP = "shop=allqualityservices.myshopify.com&storeUrl=allqualityservices.myshopify.com";

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

async function frameBox(page) {
  return page.evaluate(() => {
    let top = Infinity;
    let bottom = 0;
    const vh = document.documentElement.clientHeight;
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width < 24 || b.height < 12) continue;
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

async function dismissBanners(page) {
  for (const name of [/Dismiss reminder/i, /Dismiss/i, /^Close$/i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

{
  const page = await newPage();
  const url =
    `${ORIGIN}/?variant=plaque&${SHOP}` +
    `&product=9230817591546&plaqueProductHandle=custom-plaque&variantIdSign=48906792337658`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  await jsClick(page, /Attached plate/, "plaque layout");
  await jsClick(page, /^\s*Medium\s*-\s*Frame size/, "plaque size");
  await jsClick(page, /Brushed Gold/, "plaque finish");
  await jsClick(page, /Enter your text/, "plaque text step");
  await jsClick(page, /Add Line/, "plaque add line 3");
  await jsClick(page, /Add Line/, "plaque add line 4");

  const values = ["ELIZA REED", "EMPLOYEE OF THE YEAR", "FOR DEDICATED SERVICE", "ALL QUALITY 2026"];
  const textInputs = page.locator('input[type="text"]:visible');
  const count = await textInputs.count();
  for (let i = 0; i < Math.min(count, values.length); i++) {
    await textInputs.nth(i).fill(values[i]).catch(() => {});
    await page.waitForTimeout(250);
  }
  console.log(`  plaque: filled ${Math.min(count, values.length)} of ${count} lines`);

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(4000);
  await crop(page, join(outDir, "plaque-raw-full.png"), join(outDir, "sbl-plaque-designer-shot.jpg"), 1000);
  await page.close();
}

{
  const page = await newPage();
  const url =
    `${ORIGIN}/trophy-designer?embedded=1&${SHOP}` +
    `&product=15420982067450&productHandle=custom-trophy&variantId=67682174861562`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);
  await dismissBanners(page);

  await jsClick(page, /Star Trophy/, "trophy style");
  const values = ["CHAMPIONS", "VARSITY SOCCER", "2026 SEASON"];
  const inputs = page.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible');
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
  await crop(page, join(outDir, "trophy-raw-full.png"), join(outDir, "sbl-trophy-designer-shot.jpg"), 1000);
  await page.close();
}

await browser.close();
