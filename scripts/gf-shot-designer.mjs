/**
 * Captures a real screenshot of the live gavel designer for use as the
 * homepage hero image, replacing the hand-built mock.
 *
 * Drives the actual tool to the Design step (walnut + gold, matching the
 * homepage copy), types customer text so the 3D band and the proof panel show
 * a genuine personalization, then crops to the app frame using DOM geometry
 * rather than hardcoded pixels.
 *
 * Usage: node scripts/gf-shot-designer.mjs [outDir]
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const outDir = process.argv[2] ?? "tmp-gf-shots";
const SCALE = 2;
const PRODUCT = { id: "8228411244606", variant: "43230301192254", price: "19.99" };
const url =
  "https://all-quality-design-tool.vercel.app/gavel-designer?embedded=1" +
  "&shop=gavelsfast.myshopify.com&storeUrl=gavelsfast.myshopify.com" +
  `&product=${PRODUCT.id}&productType=gavel&productHandle=custom-wooden-gavel` +
  `&variantId=${PRODUCT.variant}&price=${PRODUCT.price}`;

const variants = [
  { name: "long", line1: "Model United Nations", line2: "Secretary-General" },
  { name: "short", line1: "Model U.N. 2026", line2: "Chair" },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: SCALE,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(4000);

await page.getByRole("button", { name: /Continue to gavel/i }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Wooden Walnut/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Gold$/i }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Continue to design/i }).click();
await page.waitForTimeout(2500);

/** Frame bounds plus the bottom of the proof card, so the crop ends on a
 *  natural boundary instead of slicing through the next panel. */
async function geometry() {
  return page.evaluate(() => {
    const abs = (el) => {
      const b = el.getBoundingClientRect();
      return {
        x: b.left + window.scrollX,
        y: b.top + window.scrollY,
        w: b.width,
        h: b.height,
      };
    };
    // The navy app frame is the widest element that is not html/body.
    const frame = [...document.querySelectorAll("body *")]
      .map((el) => ({ el, b: abs(el) }))
      .filter((o) => o.b.w > 900 && o.b.h > 500)
      .sort((a, b) => b.b.w * b.b.h - a.b.w * a.b.h)[0];

    let proof = null;
    const label = [...document.querySelectorAll("*")].find(
      (e) => /UNWRAPPED BAND/i.test(e.textContent || "") && e.children.length === 0,
    );
    for (let el = label; el && el !== document.body; el = el.parentElement) {
      const b = abs(el);
      if (b.w > 300 && b.h > 60) {
        proof = b;
        break;
      }
    }
    return { frame: frame ? abs(frame.el) : null, proof };
  });
}

for (const v of variants) {
  const l1 = page.locator('input[placeholder="Your name here"]');
  await l1.fill("");
  await l1.type(v.line1, { delay: 30 });
  const l2 = page.locator('input[placeholder="Title or organization"]');
  await l2.fill("");
  await l2.type(v.line2, { delay: 30 });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(3500);

  const raw = join(outDir, `designer-raw-${v.name}.png`);
  await page.screenshot({ path: raw, fullPage: true });

  const g = await geometry();
  const out = join(outDir, `gf-designer-${v.name}.png`);
  if (g.frame && g.proof) {
    const pad = 14;
    const left = Math.round(g.frame.x * SCALE);
    const top = Math.round(g.frame.y * SCALE);
    const width = Math.round(g.frame.w * SCALE);
    const height = Math.round((g.proof.y + g.proof.h + pad - g.frame.y) * SCALE);
    const meta = await sharp(raw).metadata();
    await sharp(raw)
      .extract({
        left,
        top,
        width: Math.min(width, meta.width - left),
        height: Math.min(height, meta.height - top),
      })
      .resize({ width: 1600, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: false })
      .toFile(out);
    const m = await sharp(out).metadata();
    console.log(`${v.name}: ${out} ${m.width}x${m.height}`);
  } else {
    console.log(`${v.name}: geometry lookup failed`, JSON.stringify(g));
  }
}

await browser.close();
