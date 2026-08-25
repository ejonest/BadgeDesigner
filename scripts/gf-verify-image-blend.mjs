/**
 * Verifies that homepage product photos blend into their cream frames.
 *
 * Takes one full-page screenshot (the true composited result, including
 * mix-blend-mode) and samples patches just inside each photo's own bounding
 * box, so the frame's padding is never mistaken for the photo backdrop.
 *
 * Usage: node scripts/gf-verify-image-blend.mjs [outDir]
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const outDir = process.argv[2] ?? "tmp-gf-shots";
const url = "https://gavelsfast.myshopify.com/?preview_theme_id=142001537086";
const FRAME = { r: 0xf7, g: 0xf4, b: 0xef };
const hex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2500);

const boxes = await page.evaluate(() => {
  const sels = [
    [".gf-cats__media img", "category"],
    [".gf-best__img", "bestseller"],
    [".gf-tool__stage-img", "hero-stage"],
    [".gf-tool__thumb img", "hero-thumb"],
  ];
  const out = [];
  for (const [sel, label] of sels) {
    document.querySelectorAll(sel).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      out.push({
        name: `${label}-${i + 1}`,
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        w: r.width,
        h: r.height,
        src: (el.currentSrc || el.src).split("/").pop().split("?")[0].slice(0, 30),
      });
    });
  }
  return out;
});

const shotPath = join(outDir, "gf-blend-verify-full.png");
await page.screenshot({ path: shotPath, fullPage: true });
await browser.close();

const base = sharp(shotPath).flatten({ background: "#ffffff" });
const meta = await base.metadata();

async function patch(left, top, size) {
  const l = Math.max(0, Math.min(Math.round(left), meta.width - size));
  const t = Math.max(0, Math.min(Math.round(top), meta.height - size));
  const { data, info } = await sharp(shotPath)
    .flatten({ background: "#ffffff" })
    .extract({ left: l, top: t, width: size, height: size })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / info.channels;
  for (let i = 0; i < data.length; i += info.channels) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / n, g: g / n, b: b / n };
}

console.log(`frame colour: ${hex(FRAME)}   (sampling inside each photo)\n`);
console.log(
  ["photo".padEnd(15), "file".padEnd(32), "backdrop".padEnd(10), "Δ".padEnd(5), "verdict"].join(""),
);

for (const b of boxes) {
  if (b.w < 20 || b.h < 20) continue;
  const s = Math.max(3, Math.round(Math.min(b.w, b.h) * 0.05));
  const inset = Math.max(2, Math.round(Math.min(b.w, b.h) * 0.02));
  const spots = [
    [b.x + inset, b.y + inset],
    [b.x + b.w - inset - s, b.y + inset],
    [b.x + inset, b.y + b.h - inset - s],
    [b.x + b.w - inset - s, b.y + b.h - inset - s],
  ];
  const cs = [];
  for (const [l, t] of spots) cs.push(await patch(l, t, s));
  // Use the lightest corner: product content darkens corners on full-frame
  // shots, but the backdrop is always the lightest region.
  const lum = (c) => c.r + c.g + c.b;
  const c = cs.reduce((a, x) => (lum(x) > lum(a) ? x : a), cs[0]);
  const d = Math.round(
    Math.abs(c.r - FRAME.r) + Math.abs(c.g - FRAME.g) + Math.abs(c.b - FRAME.b),
  );
  const verdict = d <= 8 ? "blends" : d <= 20 ? "slightly off" : "CLASHES";
  console.log(
    [b.name.padEnd(15), b.src.padEnd(32), hex(c).padEnd(10), String(d).padEnd(5), verdict].join(""),
  );
}
