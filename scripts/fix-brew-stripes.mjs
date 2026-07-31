/**
 * Straighten Brew badge stripe frames for print.
 *
 * The mockup draws the cream double-line as a rounded-rect frame that curls
 * around the die corners. Print needs those lines straight across the bleed
 * rectangle, with solid green in the corner arcs.
 *
 * The coffee cup/saucer in the bottom-right is restored from the original so
 * stripe cleanup never eats photo pixels.
 *
 * Usage:
 *   node scripts/fix-brew-stripes.mjs
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  processParent,
  sizesForTemplate,
} from "./cut-die-from-rect-parent.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(root, "public/badge-custom-backgrounds");
const OUT = join(root, "app/temp/Color Custom Badges/plan2-rect-parents");
const QA = join(root, "app/temp/qa");

const JOBS = [
  { stem: "Coffee-Shop-Café-Badges-Brew-(1x3)", templateId: "rect-1x3" },
  { stem: "Coffee-Shop-Café-Badges-Brew-(1.5x3)", templateId: "rect-1_5x3" },
];

function reader(buf, W) {
  return (x, y) => {
    const i = (y * W + x) * 3;
    return [buf[i], buf[i + 1], buf[i + 2]];
  };
}

function writer(buf, W) {
  return (x, y, rgb) => {
    const i = (y * W + x) * 3;
    buf[i] = rgb[0];
    buf[i + 1] = rgb[1];
    buf[i + 2] = rgb[2];
  };
}

function luma(rgb) {
  return (rgb[0] + rgb[1] + rgb[2]) / 3;
}

function findStripeBands(at, W, H) {
  const x = Math.floor(W / 2);
  const bright = [];
  for (let y = 0; y < H; y++) {
    if (luma(at(x, y)) >= 200) bright.push(y);
  }
  const runs = [];
  for (const y of bright) {
    if (!runs.length || y > runs[runs.length - 1].end + 2) {
      runs.push({ start: y, end: y });
    } else {
      runs[runs.length - 1].end = y;
    }
  }
  return runs.filter((r) => {
    const h = r.end - r.start + 1;
    return h >= 4 && h <= 30;
  });
}

function sampleGreen(at, W, H) {
  const x0 = Math.floor(W * 0.3);
  const y0 = Math.floor(H * 0.5);
  const acc = [0, 0, 0];
  let n = 0;
  for (let dy = -30; dy <= 30; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      const p = at(x0 + dx, y0 + dy);
      const L = luma(p);
      if (L > 30 && L < 90) {
        acc[0] += p[0];
        acc[1] += p[1];
        acc[2] += p[2];
        n++;
      }
    }
  }
  if (!n) return [0, 88, 66];
  return acc.map((v) => Math.round(v / n));
}

function sampleStripe(at, W, band) {
  const x0 = Math.floor(W / 2);
  const acc = [0, 0, 0];
  let n = 0;
  for (let x = x0 - 50; x <= x0 + 50; x++) {
    for (let y = band.start; y <= band.end; y++) {
      const p = at(x, y);
      if (luma(p) >= 200) {
        acc[0] += p[0];
        acc[1] += p[1];
        acc[2] += p[2];
        n++;
      }
    }
  }
  if (!n) return [242, 233, 224];
  return acc.map((v) => Math.round(v / n));
}

async function straighten(bleedPath, templateId) {
  const sizes = sizesForTemplate(templateId);
  const { data, info } = await sharp(bleedPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const orig = Buffer.from(data);
  const out = Buffer.from(data);
  const atOrig = reader(orig, W);
  const at = reader(out, W);
  const set = writer(out, W);

  const bands = findStripeBands(at, W, H);
  if (bands.length < 2) {
    throw new Error(
      `expected ≥2 cream stripe bands at centre, found ${bands.length}`,
    );
  }
  const green = sampleGreen(at, W, H);
  const stripe = sampleStripe(at, W, bands[0]);
  const cornerDepth = sizes.pad + sizes.radiusPx + 16;

  const colorDist = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  const nearGreen = (p) => colorDist(p, green) <= 55;
  const isWarmCream = (p) => {
    const L = luma(p);
    if (L < 200) return false;
    if (p[0] - p[2] < 10) return false; // reject neutral porcelain
    return colorDist(p, stripe) <= 35;
  };
  const isGreenFamily = (p) => {
    const L = luma(p);
    return L < 140 && p[1] > p[0] + 4 && p[1] >= p[2] - 8;
  };
  // Soft green↔cream blend (G clearly dominant — not warm foam).
  const isMintyAA = (p) => {
    const L = luma(p);
    if (L < 100 || L > 200) return false;
    if (p[1] <= p[0] + 5) return false;
    return Math.max(...p) - Math.min(...p) <= 50;
  };
  const isFramePixel = (p) =>
    nearGreen(p) || isGreenFamily(p) || isWarmCream(p) || isMintyAA(p);
  // Cup / saucer / wood / latte — anything that isn't the green+cream frame.
  const isCupContent = (p) => !isFramePixel(p);

  const topBands = bands.filter((b) => b.end < H / 2);
  const botBands = bands.filter((b) => b.start >= H / 2);
  const onBandY = (y) => bands.some((b) => y >= b.start && y <= b.end);
  const cd = cornerDepth + 24;

  // Only edit frame pixels inside the cup bbox.
  const inCupRegion = (x, y) =>
    x >= Math.floor(W * 0.5) && y >= Math.floor(H * 0.3);
  const canModify = (x, y, p) => {
    if (!inCupRegion(x, y)) return true;
    return isFramePixel(p);
  };

  // 1) Nuke TL / TR / BL. Skip BR — cup lives there; step 4 restores photo.
  const fillCorner = (x0, x1, y0, y1) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!canModify(x, y, at(x, y))) continue;
        set(x, y, green);
      }
    }
  };
  fillCorner(0, cd, 0, cd);
  fillCorner(W - cd, W, 0, cd);
  fillCorner(0, cd, H - cd, H);

  // 2) Stripe zones: force non-band rows to green (U-turns + AA).
  const topZoneEnd = topBands.length
    ? topBands[topBands.length - 1].end + 2
    : Math.floor(H * 0.25);
  const botZoneStart = botBands.length
    ? botBands[0].start - 2
    : Math.floor(H * 0.75);
  for (let y = 0; y <= topZoneEnd; y++) {
    if (onBandY(y)) continue;
    for (let x = 0; x < W; x++) {
      if (!canModify(x, y, at(x, y))) continue;
      set(x, y, green);
    }
  }
  for (let y = botZoneStart; y < H; y++) {
    if (onBandY(y)) continue;
    for (let x = 0; x < W; x++) {
      if (!canModify(x, y, at(x, y))) continue;
      set(x, y, green);
    }
  }

  // 3) Straight cream bands (frame pixels only inside cup region).
  for (const b of bands) {
    for (let y = b.start; y <= b.end; y++) {
      for (let x = 0; x < W; x++) {
        const p = at(x, y);
        if (!canModify(x, y, p)) continue;
        set(x, y, stripe);
      }
    }
  }

  // 4) Restore cup/saucer/wood from the untouched original.
  const restoreX0 = Math.floor(W * 0.45);
  const restoreY0 = Math.floor(H * 0.25);
  let restored = 0;
  for (let y = restoreY0; y < H; y++) {
    for (let x = restoreX0; x < W; x++) {
      const p = atOrig(x, y);
      if (!isCupContent(p)) continue;
      set(x, y, p);
      restored++;
    }
  }

  const pairGaps = [];
  if (topBands.length >= 2) {
    pairGaps.push({
      start: topBands[0].end + 1,
      end: topBands[topBands.length - 1].start - 1,
    });
  }
  if (botBands.length >= 2) {
    pairGaps.push({
      start: botBands[0].end + 1,
      end: botBands[botBands.length - 1].start - 1,
    });
  }
  const outerZones = [];
  if (topBands.length) {
    outerZones.push({ start: 0, end: topBands[0].start - 1 });
  }
  if (botBands.length) {
    outerZones.push({
      start: botBands[botBands.length - 1].end + 1,
      end: H - 1,
    });
  }

  return {
    png: await sharp(out, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer(),
    report: {
      bands,
      green,
      stripe,
      cornerDepth,
      pairGaps,
      outerZones,
      restored,
    },
  };
}

async function main() {
  mkdirSync(join(OUT, "parents"), { recursive: true });
  mkdirSync(QA, { recursive: true });

  for (const job of JOBS) {
    const src = join(PUBLIC, `${job.stem}-bleed.png`);
    console.log(`\n${job.stem}`);
    copyFileSync(src, join(QA, `${job.stem}-bleed-before-stripes.png`));
    const { png, report } = await straighten(src, job.templateId);
    console.log("  ", JSON.stringify(report));

    const parentPath = join(OUT, "parents", `${job.stem}-parent.png`);
    writeFileSync(parentPath, png);
    await processParent({
      parentPath,
      templateId: job.templateId,
      stem: job.stem,
      outDir: OUT,
      coverPosition: "centre",
    });
    copyFileSync(
      join(OUT, "print-bleed", `${job.stem}-bleed.png`),
      join(PUBLIC, `${job.stem}-bleed.png`),
    );

    const installed = join(PUBLIC, `${job.stem}-bleed.png`);
    const meta = await sharp(installed).metadata();
    await sharp(installed)
      .extract({ left: 0, top: 0, width: 240, height: 160 })
      .png()
      .toFile(join(QA, `${job.stem}-tl-after.png`));
    await sharp(installed)
      .extract({
        left: meta.width - 420,
        top: meta.height - 300,
        width: 420,
        height: 300,
      })
      .png()
      .toFile(join(QA, `${job.stem}-br-after.png`));
    console.log("  installed + corner proofs");
  }
}

await main();
