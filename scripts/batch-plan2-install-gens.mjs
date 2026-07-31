/**
 * Install generative plan2 parents from assets/ and cut bleed/die/compare.
 *
 * Usage:
 *   node scripts/batch-plan2-install-gens.mjs
 *   node scripts/batch-plan2-install-gens.mjs Transit Aroma
 *
 * Looks for assets/plan2-regen-<stem>.png (stem with / replaced by __).
 * If the gen has baked-in rounded corners (white crescents), trims and
 * cover-fills into the exact bleed sharp rect before cutting.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  dieMaskPng,
  processParent,
  sizesForTemplate,
} from "./cut-die-from-rect-parent.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const altAssets =
  "/Users/ethanjones/.cursor/projects/Users-ethanjones-Documents-Work-BadgeDesignerBackup-BadgeDesigner/assets";
const outDir = join(root, "app/temp/Color Custom Badges/plan2-rect-parents");
const parentsDir = join(outDir, "parents");
const publicDir = join(root, "public/badge-custom-backgrounds");
const manifest = JSON.parse(
  readFileSync(join(outDir, "manifest-todo.json"), "utf8"),
);
const backgroundsConfig = JSON.parse(
  readFileSync(join(root, "app/data/badge-custom-backgrounds.local.json"), "utf8"),
);

/**
 * These generated parents rearranged edge artwork vertically, so a 3:1 cover crop cannot
 * retain every motif. Preserve the calibrated composition from the original badge face
 * and use the generated rectangle only for the surrounding bleed.
 */
const USE_ORIGINAL_FACE_COMPOSITION = new Set([
  "Retail-Customer-Service-Badges-Service-(1x3)",
]);

export function stemToGenName(stem) {
  // Keep letters (incl. accented) and digits; collapse other runs to _
  return `plan2-regen-${stem.replace(/[^\p{L}\p{N}.-]+/gu, "_")}.png`;
}

async function cornerLooksWhite(buf, w, h) {
  const pts = [
    [0, 0],
    [w - 6, 0],
    [0, h - 6],
    [w - 6, h - 6],
  ];
  let whiteish = 0;
  for (const [x, y] of pts) {
    const raw = await sharp(buf)
      .extract({ left: x, top: y, width: 6, height: 6 })
      .raw()
      .toBuffer();
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < raw.length; i += 3) {
      r += raw[i];
      g += raw[i + 1];
      b += raw[i + 2];
      n++;
    }
    r /= n;
    g /= n;
    b /= n;
    if (r > 245 && g > 245 && b > 245) whiteish++;
  }
  return whiteish >= 2;
}

async function sampleCenterRgb(buf) {
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const left = Math.max(0, Math.floor(w * 0.45));
  const top = Math.max(0, Math.floor(h * 0.45));
  const raw = await sharp(buf)
    .extract({
      left,
      top,
      width: Math.min(12, w - left),
      height: Math.min(12, h - top),
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < raw.length; i += 3) {
    r += raw[i];
    g += raw[i + 1];
    b += raw[i + 2];
    n++;
  }
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  };
}

function fitModeFor(stem) {
  // Hello My Name: pad safe margins then cover (keeps top text + bottom icons).
  if (/Hello-My-Name/i.test(stem)) return "hello-safe";
  return "cover";
}

function coverPositionFor(stem, templateId) {
  // Motifs often sit on the lower edge; bottom cover keeps them for tall→short crops.
  if (templateId === "rect-1x3") return "bottom";
  if (/Voyage|Chill|Scholar|Church|QR|floral/i.test(stem)) return "centre";
  return "bottom";
}

async function toSharpBleedParent(genPath, bleedW, bleedH, coverPosition, fit = "cover") {
  let img = sharp(genPath);
  const meta = await img.metadata();
  let buf = await img.png().toBuffer();

  if (await cornerLooksWhite(buf, meta.width, meta.height)) {
    buf = await sharp(buf)
      .trim({
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        threshold: 14,
      })
      .png()
      .toBuffer();
  }

  if (fit === "contain") {
    const bg = await sampleCenterRgb(buf);
    return sharp(buf)
      .resize(bleedW, bleedH, {
        fit: "contain",
        position: "centre",
        background: bg,
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
  }

  if (fit === "hello-safe") {
    // Pad top/bottom so header + icons clear the die, then contain (cover would crop them).
    const bg = await sampleCenterRgb(buf);
    const m = await sharp(buf).metadata();
    const isShort = bleedH / bleedW < 0.4; // 1x3
    const padFrac = isShort ? 0.14 : 0.08;
    const padY = Math.round((m.height || 1) * padFrac);
    buf = await sharp(buf)
      .extend({
        top: padY,
        bottom: padY,
        left: 0,
        right: 0,
        background: bg,
      })
      .png()
      .toBuffer();
    return sharp(buf)
      .resize(bleedW, bleedH, {
        fit: "contain",
        position: "centre",
        background: bg,
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
  }

  return sharp(buf)
    .resize(bleedW, bleedH, {
      fit: "cover",
      position: coverPosition,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function restoreOriginalFaceComposition(entry, parentBuf, sizes) {
  if (!USE_ORIGINAL_FACE_COMPOSITION.has(entry.stem)) return parentBuf;

  const background = backgroundsConfig.backgrounds.find((b) => b.id === entry.id);
  const faceNorm = background?.badgeFaceRectNorm;
  const sourcePath = join(root, entry.src);
  if (!faceNorm || !existsSync(sourcePath)) {
    throw new Error(`Missing calibrated original face for ${entry.stem}`);
  }

  const sourceMeta = await sharp(sourcePath).metadata();
  const sourceW = sourceMeta.width || backgroundsConfig.canvasWidthPx;
  const sourceH = sourceMeta.height || backgroundsConfig.canvasHeightPx;
  // The calibrated rect includes a few pixels of the website mockup's white/shadow edge.
  // Trim those pixels before scaling so the production die contains artwork only.
  // Service 1x3's calibrated rect includes the white page plus its grey
  // shadow ramp. Start at the first orange pixels on each affected edge so
  // that ring cannot be scaled into the production face.
  const edgeTrim = { left: 3, top: 11, right: 0, bottom: 16 };
  const calibratedLeft = Math.max(0, Math.round(faceNorm.xNorm * sourceW));
  const calibratedTop = Math.max(0, Math.round(faceNorm.yNorm * sourceH));
  const calibratedWidth = Math.min(
    sourceW - calibratedLeft,
    Math.round(faceNorm.widthNorm * sourceW),
  );
  const calibratedHeight = Math.min(
    sourceH - calibratedTop,
    Math.round(faceNorm.heightNorm * sourceH),
  );
  const left = calibratedLeft + edgeTrim.left;
  const top = calibratedTop + edgeTrim.top;
  const width = calibratedWidth - edgeTrim.left - edgeTrim.right;
  const height = calibratedHeight - edgeTrim.top - edgeTrim.bottom;

  const face = await sharp(sourcePath)
    .extract({ left, top, width, height })
    .resize(sizes.dieW, sizes.dieH, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = await dieMaskPng(sizes.dieW, sizes.dieH, sizes.radiusPx);
  const maskedFace = await sharp(face)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Rebuild the bleed field without the badly cropped motifs from the generated parent.
  // The gradient matches the original Service artwork and gives the cutter clean overhang.
  const cleanBleedField = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"
      width="${sizes.bleedW}" height="${sizes.bleedH}">
      <defs>
        <linearGradient id="service-bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ff9214"/>
          <stop offset="0.55" stop-color="#ffa720"/>
          <stop offset="1" stop-color="#ffb62c"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#service-bg)"/>
    </svg>`),
  )
    .png()
    .toBuffer();

  return sharp(cleanBleedField)
    .composite([{ input: maskedFace, left: sizes.pad, top: sizes.pad }])
    .png()
    .toBuffer();
}

async function installOne(entry) {
  const assets = altAssets;
  const genName = stemToGenName(entry.stem);
  const genPath = join(assets, genName);
  if (!existsSync(genPath)) {
    return { stem: entry.stem, skipped: true, reason: "missing_gen", genName };
  }

  mkdirSync(parentsDir, { recursive: true });
  const sizes = sizesForTemplate(entry.templateId);
  const coverPosition = coverPositionFor(entry.stem, entry.templateId);
  const fit = fitModeFor(entry.stem);
  let parentBuf = await toSharpBleedParent(
    genPath,
    sizes.bleedW,
    sizes.bleedH,
    coverPosition,
    fit,
  );
  parentBuf = await restoreOriginalFaceComposition(entry, parentBuf, sizes);
  const parentPath = join(parentsDir, `${entry.stem}-parent.png`);
  writeFileSync(parentPath, parentBuf);

  const proof = await processParent({
    parentPath,
    templateId: entry.templateId,
    stem: entry.stem,
    outDir,
    coverPosition: "centre", // already exact bleed size
  });
  copyFileSync(
    join(outDir, "print-bleed", proof.files.bleedName),
    join(publicDir, proof.files.bleedName),
  );
  return { stem: entry.stem, ok: true, compare: proof.files.compareName };
}

async function main() {
  const filters = process.argv.slice(2).map((s) => s.toLowerCase());
  const targets = manifest.filter((m) => {
    if (!filters.length) return true;
    return filters.some((f) => m.stem.toLowerCase().includes(f));
  });

  const results = [];
  for (const entry of targets) {
    try {
      const r = await installOne(entry);
      results.push(r);
      console.log(
        r.skipped
          ? `skip ${r.stem} (${r.reason}: ${r.genName})`
          : `✓ ${r.stem} → ${r.compare}`,
      );
    } catch (e) {
      console.error(`✗ ${entry.stem}`, e.message || e);
      results.push({ stem: entry.stem, error: String(e.message || e) });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const skip = results.filter((r) => r.skipped).length;
  const err = results.filter((r) => r.error).length;
  console.log(`\nDone: ${ok} installed, ${skip} skipped, ${err} errors`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
