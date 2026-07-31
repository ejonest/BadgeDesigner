/**
 * Crop-zoom bleed proposal (#3):
 * - Preview: inset the badge face by ~0.05″ per side, then scale back up
 *   (slight zoom). Users design on this.
 * - Print: full original face on a sharp rect with plate pad. The ring that
 *   was cropped out of the preview becomes the bleed.
 *
 * Writes to: app/temp/Color Custom Badges/crop-zoom-proposal/
 *   preview-zoom/   — proposed designer faces (zoomed)
 *   print-bleed/    — proposed print assets (full face + pad)
 *   compare/        — original face | zoomed preview side-by-side
 *
 * Usage: node scripts/generate-crop-zoom-proposals.mjs
 *        node scripts/generate-crop-zoom-proposals.mjs coast
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const configPath = join(root, "app/data/badge-custom-backgrounds.local.json");
const publicDir = join(root, "public/badge-custom-backgrounds");
const outRoot = join(
  root,
  "app/temp/Color Custom Badges/crop-zoom-proposal",
);
const previewDir = join(outRoot, "preview-zoom");
const bleedDir = join(outRoot, "print-bleed");
const compareDir = join(outRoot, "compare");

const BLEED_IN_PER_SIDE = 0.05;
const DIE_WIDTH_IN = 3;
const DIE_HEIGHT_IN_BY_TEMPLATE = {
  "rect-1x3": 1,
  "rect-1_5x3": 1.5,
  "square-1x3": 1,
  "square-1_5x3": 1.5,
};

const PAGE_WHITE_DIST = 18;
const MIN_DIST_FROM_PLATE = 28;

function previewToBleedFileName(fileName) {
  const base = fileName
    .replace(/-Badge-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "");
  return `${base}-bleed.png`;
}

function previewToZoomFileName(fileName) {
  const base = fileName
    .replace(/-Badge-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "");
  return `${base}-preview-zoom.jpg`;
}

function denorm(norm, canvasW, canvasH) {
  return {
    x: Math.round(norm.xNorm * canvasW),
    y: Math.round(norm.yNorm * canvasH),
    width: Math.round(norm.widthNorm * canvasW),
    height: Math.round(norm.heightNorm * canvasH),
  };
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCenterPlate(rgba, w, h) {
  const rs = [];
  const gs = [];
  const bs = [];
  const x0 = Math.floor(w * 0.3);
  const x1 = Math.floor(w * 0.7);
  const y0 = Math.floor(h * 0.3);
  const y1 = Math.floor(h * 0.7);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const pi = (y * w + x) * 4;
      rs.push(rgba[pi]);
      gs.push(rgba[pi + 1]);
      bs.push(rgba[pi + 2]);
    }
  }
  const mid = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [mid(rs), mid(gs), mid(bs)];
}

function isPageWhite(r, g, b, plate) {
  const nearWhite = colorDist(r, g, b, 255, 255, 255) <= PAGE_WHITE_DIST;
  if (!nearWhite) return false;
  return colorDist(r, g, b, plate[0], plate[1], plate[2]) >= MIN_DIST_FROM_PLATE;
}

function floodPageExterior(rgba, w, h, plate) {
  const exterior = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const seeds = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];
  const queue = [];
  for (const [sx, sy] of seeds) {
    const si = (sy * w + sx) * 4;
    if (isPageWhite(rgba[si], rgba[si + 1], rgba[si + 2], plate)) {
      queue.push([sx, sy]);
    }
  }
  let qi = 0;
  while (qi < queue.length) {
    const [x, y] = queue[qi++];
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const pi = idx * 4;
    if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate)) continue;
    exterior[idx] = 1;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return exterior;
}

function insideRoundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (x >= r && x < w - r) return true;
  if (y >= r && y < h - r) return true;
  const cx = x < r ? r : w - 1 - r;
  const cy = y < r ? r : h - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function estimateCornerRadius(rgba, w, h, plate) {
  const insetFromLeft = (y) => {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate)) return x;
    }
    return 0;
  };
  const insetFromRight = (y) => {
    for (let x = w - 1; x >= 0; x--) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate))
        return w - 1 - x;
    }
    return 0;
  };
  const samples = [
    insetFromLeft(0),
    insetFromLeft(1),
    insetFromRight(0),
    insetFromRight(1),
    insetFromLeft(h - 1),
    insetFromRight(h - 1),
  ].filter((v) => v > 0 && v < Math.min(w, h) * 0.55);
  if (samples.length < 2) return Math.round(Math.min(w, h) * 0.12);
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

/**
 * Clean face: replace page-white outside the rounded die with plate color.
 * Returns RGBA buffer (mutates a copy).
 */
function cleanFaceRgba(faceRgba, faceW, faceH) {
  const plate = sampleCenterPlate(faceRgba, faceW, faceH);
  const exterior = floodPageExterior(faceRgba, faceW, faceH, plate);
  const radius = estimateCornerRadius(faceRgba, faceW, faceH, plate);
  const out = Buffer.from(faceRgba);

  for (let y = 0; y < faceH; y++) {
    for (let x = 0; x < faceW; x++) {
      const idx = y * faceW + x;
      const pi = idx * 4;
      let ext = exterior[idx];
      if (!insideRoundRect(x, y, faceW, faceH, radius)) {
        if (
          isPageWhite(out[pi], out[pi + 1], out[pi + 2], plate) ||
          colorDist(out[pi], out[pi + 1], out[pi + 2], 255, 255, 255) <= 40
        ) {
          ext = 1;
        }
      }
      if (ext) {
        out[pi] = plate[0];
        out[pi + 1] = plate[1];
        out[pi + 2] = plate[2];
        out[pi + 3] = 255;
      }
    }
  }
  return { rgba: out, plate, radius };
}

async function processEntry(entry, canvasW, canvasH) {
  const srcPath = join(publicDir, entry.fileName);
  if (!existsSync(srcPath)) {
    throw new Error(`Missing source: ${entry.fileName}`);
  }

  const dieHIn =
    DIE_HEIGHT_IN_BY_TEMPLATE[entry.templateId] ??
    (entry.templateId.includes("1_5") || entry.templateId.includes("1.5")
      ? 1.5
      : 1);

  const faceNorm = entry.badgeFaceRectNorm ?? {
    xNorm: 0,
    yNorm: 0,
    widthNorm: 1,
    heightNorm: 1,
  };
  const face = denorm(faceNorm, canvasW, canvasH);
  const left = Math.max(0, face.x);
  const top = Math.max(0, face.y);
  const width = Math.min(face.width, canvasW - left);
  const height = Math.min(face.height, canvasH - top);

  const faceRaw = await sharp(srcPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const faceW = faceRaw.info.width;
  const faceH = faceRaw.info.height;
  const padX = Math.max(
    1,
    Math.round(faceW * (BLEED_IN_PER_SIDE / DIE_WIDTH_IN)),
  );
  const padY = Math.max(
    1,
    Math.round(faceH * (BLEED_IN_PER_SIDE / dieHIn)),
  );
  const insetW = Math.max(1, faceW - padX * 2);
  const insetH = Math.max(1, faceH - padY * 2);

  const facePng = await sharp(faceRaw.data, {
    raw: { width: faceW, height: faceH, channels: 4 },
  })
    .png()
    .toBuffer();

  // Preview zoom: crop-zoom ONLY from the original face (no plate fill).
  // Plate fill was making sky-sampled blue corners + emphasizing the die halo.
  const zoomFacePng = await sharp(facePng)
    .extract({ left: padX, top: padY, width: insetW, height: insetH })
    .resize(faceW, faceH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .png()
    .toBuffer();

  const white = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  const mockupJpg = await sharp(white)
    .composite([{ input: zoomFacePng, left, top }])
    .jpeg({ quality: 92 })
    .toBuffer();

  // Print: clean page-white → plate, then scale so inset → die and ring → bleed
  const cleaned = cleanFaceRgba(faceRaw.data, faceW, faceH);
  const cleanedPng = await sharp(cleaned.rgba, {
    raw: { width: faceW, height: faceH, channels: 4 },
  })
    .png()
    .toBuffer();

  const printW = Math.round(faceW * (faceW / insetW));
  const printH = Math.round(faceH * (faceH / insetH));
  const bleedPng = await sharp(cleanedPng)
    .resize(printW, printH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .png()
    .toBuffer();

  const comparePng = await sharp({
    create: {
      width: faceW * 2 + 16,
      height: faceH + 40,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .composite([
      { input: facePng, left: 0, top: 32 },
      { input: zoomFacePng, left: faceW + 16, top: 32 },
      {
        input: Buffer.from(
          `<svg width="${faceW * 2 + 16}" height="28">
            <text x="8" y="20" font-family="sans-serif" font-size="16" fill="#333">Original face</text>
            <text x="${faceW + 24}" y="20" font-family="sans-serif" font-size="16" fill="#333">Preview zoom (crop only)</text>
          </svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const zoomName = previewToZoomFileName(entry.fileName);
  const bleedName = previewToBleedFileName(entry.fileName);
  const compareName = bleedName.replace(/-bleed\.png$/i, "-compare.png");

  writeFileSync(join(previewDir, zoomName), mockupJpg);
  writeFileSync(join(bleedDir, bleedName), bleedPng);
  writeFileSync(join(compareDir, compareName), comparePng);

  return {
    id: entry.id,
    zoomName,
    bleedName,
    padX,
    padY,
    faceW,
    faceH,
    printW,
    printH,
    zoomPctX: ((padX * 2) / faceW) * 100,
    zoomPctY: ((padY * 2) / faceH) * 100,
  };
}

async function main() {
  const filter = (process.argv[2] || "").toLowerCase();
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const { canvasWidthPx, canvasHeightPx, backgrounds } = cfg;

  for (const d of [outRoot, previewDir, bleedDir, compareDir]) {
    mkdirSync(d, { recursive: true });
  }

  writeFileSync(
    join(outRoot, "README.txt"),
    `Crop-zoom bleed proposal (#3)
================================
Generated by scripts/generate-crop-zoom-proposals.mjs

How it works
------------
1. Take the calibrated badge face from each mockup.
2. Replace page-white outside the rounded die with plate color.
3. PREVIEW: inset ~0.05″ per side, scale back up to face size (slight zoom).
   This is the finished die look users design on.
4. PRINT: scale the full cleaned face so that inset maps to the die size.
   The ring cropped from the preview becomes the bleed overhang.
   Corner crescents stay plate (source art is die-shaped).

Folders
-------
preview-zoom/  Proposed designer mockups (zoomed faces on white)
print-bleed/   Proposed print assets (scaled full face → die + bleed)
compare/       Original face | zoomed preview side-by-side

No AI / no generative fill — only crop + scale from your originals.

Best place to judge the zoom: open compare/ and look left vs right.
`,
  );

  const entries = backgrounds.filter((e) => {
    if (!filter) return true;
    return (
      e.id.toLowerCase().includes(filter) ||
      e.fileName.toLowerCase().includes(filter) ||
      e.name.toLowerCase().includes(filter) ||
      e.category.toLowerCase().includes(filter)
    );
  });

  console.log(`Crop-zoom proposals → ${outRoot}`);
  console.log(`Processing ${entries.length} / ${backgrounds.length} backgrounds`);

  const results = [];
  for (const entry of entries) {
    try {
      const r = await processEntry(entry, canvasWidthPx, canvasHeightPx);
      results.push(r);
      console.log(
        `✓ ${entry.id}  pad=${r.padX}x${r.padY}px  zoom≈${r.zoomPctX.toFixed(1)}%×${r.zoomPctY.toFixed(1)}%`,
      );
    } catch (err) {
      console.error(`✗ ${entry.id}: ${err.message}`);
    }
  }

  writeFileSync(
    join(outRoot, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        bleedInPerSide: BLEED_IN_PER_SIDE,
        count: results.length,
        results,
      },
      null,
      2,
    ),
  );

  console.log(`\nDone. ${results.length} proposals in:`);
  console.log(`  ${outRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
