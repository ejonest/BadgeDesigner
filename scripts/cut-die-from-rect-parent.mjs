/**
 * Plan 2: cut die-shaped previews from full-rectangle bleed parents.
 *
 * Source of truth for die SIZE + CORNER RADIUS = badge template SVGs:
 *   public/templates/badge/round-1x3.svg   → 3" × 1",  r = 0.25"
 *   public/templates/badge/round-1.5x3.svg → 3" × 1.5", r = 0.25"
 * Bleed = 0.05" per side → print 3.1×1.1 and 3.1×1.6
 *
 * Pipeline:
 *   1) Parent = sharp FULL RECTANGLE at bleed pixel size (no rounded art)
 *   2) Bleed asset = parent resized/cropped to exact bleed px
 *   3) Preview = CENTER die crop, masked with exact template round-rect,
 *      composited onto white mockup canvas (same layout as config face rect)
 *
 * Usage:
 *   node scripts/cut-die-from-rect-parent.mjs \
 *     --parent path/to/rect.png --template rect-1_5x3 --stem Coast-1.5x3
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const configPath = join(root, "app/data/badge-custom-backgrounds.local.json");

/** Match ~1500px-wide custom background assets (3" → 500 px/in). */
export const PX_PER_IN = 500;
export const BLEED_IN = 0.05;
/** From template SVG outline (250 / 3000 × 3" = 0.25"). */
export const CORNER_RADIUS_IN = 0.25;

export const TEMPLATES = {
  "rect-1x3": { dieWIn: 3, dieHIn: 1, svg: "public/templates/badge/round-1x3.svg" },
  "rect-1_5x3": {
    dieWIn: 3,
    dieHIn: 1.5,
    svg: "public/templates/badge/round-1.5x3.svg",
  },
};

export function sizesForTemplate(templateId) {
  const t = TEMPLATES[templateId];
  if (!t) throw new Error(`Unknown template: ${templateId}`);
  const dieW = Math.round(t.dieWIn * PX_PER_IN);
  const dieH = Math.round(t.dieHIn * PX_PER_IN);
  const pad = Math.round(BLEED_IN * PX_PER_IN);
  const bleedW = dieW + pad * 2;
  const bleedH = dieH + pad * 2;
  const radiusPx = Math.round(CORNER_RADIUS_IN * PX_PER_IN);
  return { ...t, dieW, dieH, pad, bleedW, bleedH, radiusPx, templateId };
}

/** Cover-crop/resize any image to exact WxH. */
export async function toExactSize(
  inputPathOrBuf,
  width,
  height,
  position = "centre",
) {
  return sharp(inputPathOrBuf)
    .resize(width, height, {
      fit: "cover",
      position,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

/** Rounded-rect alpha mask matching template die (exact r in px). */
export async function dieMaskPng(dieW, dieH, radiusPx) {
  const r = Math.min(radiusPx, Math.floor(Math.min(dieW, dieH) / 2));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dieW}" height="${dieH}">
  <rect x="0" y="0" width="${dieW}" height="${dieH}" rx="${r}" ry="${r}" fill="white"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** SDF of a rounded rect; negative inside. Local coords with origin at top-left. */
function signedDistanceRoundedRect(x, y, w, h, radius) {
  const r = Math.max(
    0,
    Math.min(radius, Math.floor(Math.min(w, h) / 2) - 1),
  );
  const qx = Math.abs(x - (w - 1) / 2) - (w / 2 - r);
  const qy = Math.abs(y - (h - 1) / 2) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}

/**
 * Remove a thin dark/neutral badge outline along the die path inside a bleed parent.
 * Mockup photos often leave this stroke on the face; it must not print.
 * Keeps chromatic art (flowers, logos) that crosses the trim.
 *
 * Also clears the same stroke when it sits in the bleed overhang (outside the die),
 * which is common when the photographed badge border was scaled into the pad.
 */
export async function stripInsetDieStrokePng(bleedPng, sizes, opts = {}) {
  const band = opts.band ?? 5;
  // Mockup badge borders often land in the pad/overhang, slightly outside the
  // true die SDF (seen ~pad+5..pad+10). Cover the full overhang plus margin.
  const overhangBand = opts.overhangBand ?? sizes.pad + 16;
  const { data, info } = await sharp(bleedPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const { pad, dieW, dieH, radiusPx } = sizes;
  const src = data;
  const out = Buffer.from(data);
  let removed = 0;

  const cx = pad + dieW / 2;
  const cy = pad + dieH / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lx = x - pad;
      const ly = y - pad;
      const sd = signedDistanceRoundedRect(lx, ly, dieW, dieH, radiusPx);
      const absD = Math.abs(sd);
      // Near the die path, or anywhere in the bleed overhang outside the die.
      const inOverhang = sd > 0 && sd <= overhangBand;
      const nearDie = absD <= band;
      if (!nearDie && !inOverhang) continue;

      const i = (y * W + x) * channels;
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const L = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // Keep colourful motifs (floral petals etc.).
      if (chroma > 30) continue;
      if (inOverhang) {
        // Overhang stroke AA is often near-white grey (L~241–248) on plate.
        if (L >= 250) continue;
        if (chroma > 22) continue;
        // Always plate-white in overhang — inward samples can still sit on the AA ring.
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        removed++;
        continue;
      }

      // Keep already-clean plate white inside the die.
      if (L > 215) continue;
      // Only mid/dark neutral hairlines (and their AA).
      if (L > 205 && chroma > 10) continue;

      const vx = cx - x;
      const vy = cy - y;
      const len = Math.hypot(vx, vy) || 1;
      const step = Math.max(band, Math.ceil(absD)) + 6;
      const sx = Math.max(0, Math.min(W - 1, Math.round(x + (vx / len) * step)));
      const sy = Math.max(0, Math.min(H - 1, Math.round(y + (vy / len) * step)));
      const si = (sy * W + sx) * channels;
      // Prefer a bright interior sample; if inward is also dark, force plate white.
      const iL = (src[si] + src[si + 1] + src[si + 2]) / 3;
      if (iL > 200) {
        out[i] = src[si];
        out[i + 1] = src[si + 1];
        out[i + 2] = src[si + 2];
      } else {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
      }
      removed++;
    }
  }

  const png = await sharp(out, {
    raw: { width: W, height: H, channels },
  })
    .png()
    .toBuffer();
  return { png, removed };
}

/**
 * Cut center die from bleed parent and apply exact round-rect mask.
 * Outside die → transparent (caller composites onto white).
 */
export async function cutDieFromBleed(bleedPng, sizes) {
  const { dieW, dieH, pad, radiusPx } = sizes;
  const dieCrop = await sharp(bleedPng)
    .extract({ left: pad, top: pad, width: dieW, height: dieH })
    .ensureAlpha()
    .png()
    .toBuffer();

  const mask = await dieMaskPng(dieW, dieH, radiusPx);
  // Use mask as alpha: white keeps, black drops
  return sharp(dieCrop)
    .composite([
      {
        input: mask,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

/** Place masked die onto white canvas at badgeFaceRectNorm. */
export async function buildMockupPreview(dieRgbaPng, entry, canvasW, canvasH) {
  const face = entry.badgeFaceRectNorm ?? {
    xNorm: 0,
    yNorm: 0,
    widthNorm: 1,
    heightNorm: 1,
  };
  const left = Math.round(face.xNorm * canvasW);
  const top = Math.round(face.yNorm * canvasH);
  const width = Math.round(face.widthNorm * canvasW);
  const height = Math.round(face.heightNorm * canvasH);

  // Scale die to the configured face slot (may letterbox if aspect differs —
  // we fit COVER into the face rect then center, but prefer exact aspect match).
  const dieFitted = await sharp(dieRgbaPng)
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const meta = await sharp(dieFitted).metadata();
  const ox = left + Math.floor((width - (meta.width || width)) / 2);
  const oy = top + Math.floor((height - (meta.height || height)) / 2);

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

  return sharp(white)
    .composite([{ input: dieFitted, left: Math.max(0, ox), top: Math.max(0, oy) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Prefer placing die at TRUE physical aspect into a centered slot on the
 * 1500×1500 canvas (ignore photo-derived face rect aspect which was wrong).
 */
export async function buildMockupPreviewTrueDie(
  dieRgbaPng,
  sizes,
  canvasW,
  canvasH,
) {
  const { dieW, dieH } = sizes;
  // Fit die to canvas width with margin, keep exact aspect
  const maxW = Math.round(canvasW * 0.92);
  const scale = maxW / dieW;
  const dispW = Math.round(dieW * scale);
  const dispH = Math.round(dieH * scale);
  const left = Math.round((canvasW - dispW) / 2);
  const top = Math.round((canvasH - dispH) / 2);

  const dieDisp = await sharp(dieRgbaPng)
    .resize(dispW, dispH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
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

  return sharp(white)
    .composite([{ input: dieDisp, left, top }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function processParent({
  parentPath,
  templateId,
  stem,
  outDir,
  canvasW = 1500,
  canvasH = 1500,
  /** sharp cover gravity — use "bottom" when motifs sit on the lower edge */
  coverPosition = "centre",
}) {
  const sizes = sizesForTemplate(templateId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "print-bleed"), { recursive: true });
  mkdirSync(join(outDir, "preview-die"), { recursive: true });
  mkdirSync(join(outDir, "preview-mockup"), { recursive: true });
  mkdirSync(join(outDir, "compare"), { recursive: true });

  const bleedRaw = await toExactSize(
    parentPath,
    sizes.bleedW,
    sizes.bleedH,
    coverPosition,
  );
  // Two passes: first clears the dark stroke; second clears residual AA left
  // when an inward sample still landed on the ring.
  const pass1 = await stripInsetDieStrokePng(bleedRaw, sizes);
  const pass2 = await stripInsetDieStrokePng(pass1.png, sizes);
  const bleedPng = pass2.png;
  const removed = pass1.removed + pass2.removed;
  if (removed > 0) {
    console.log(
      `[cut-die] ${stem}: stripped ${removed} die-outline px (${pass1.removed}+${pass2.removed})`,
    );
  }
  const diePng = await cutDieFromBleed(bleedPng, sizes);
  const mockupJpg = await buildMockupPreviewTrueDie(
    diePng,
    sizes,
    canvasW,
    canvasH,
  );

  // Compare strip: bleed parent | masked die on white
  const dieOnWhite = await sharp({
    create: {
      width: sizes.dieW,
      height: sizes.dieH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: diePng, left: 0, top: 0 }])
    .png()
    .toBuffer();

  const gap = 16;
  const labelH = 36;
  const compareW = sizes.bleedW + gap + sizes.dieW;
  const compareH = Math.max(sizes.bleedH, sizes.dieH) + labelH;
  const compare = await sharp({
    create: {
      width: compareW,
      height: compareH,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${compareW}" height="${labelH}">
            <text x="8" y="24" font-family="sans-serif" font-size="16" fill="#222">Print bleed ${sizes.bleedW}×${sizes.bleedH} (full rect)</text>
            <text x="${sizes.bleedW + gap + 8}" y="24" font-family="sans-serif" font-size="16" fill="#222">Die preview ${sizes.dieW}×${sizes.dieH} r=${sizes.radiusPx}px (exact template)</text>
          </svg>`,
        ),
        left: 0,
        top: 0,
      },
      { input: bleedPng, left: 0, top: labelH },
      {
        input: dieOnWhite,
        left: sizes.bleedW + gap,
        top: labelH + Math.floor((sizes.bleedH - sizes.dieH) / 2),
      },
    ])
    .png()
    .toBuffer();

  const bleedName = `${stem}-bleed.png`;
  const dieName = `${stem}-die.png`;
  const mockupName = `${stem}-preview-mockup.jpg`;
  const compareName = `${stem}-compare.png`;

  writeFileSync(join(outDir, "print-bleed", bleedName), bleedPng);
  writeFileSync(join(outDir, "preview-die", dieName), diePng);
  writeFileSync(join(outDir, "preview-mockup", mockupName), mockupJpg);
  writeFileSync(join(outDir, "compare", compareName), compare);

  // Dimension proof JSON
  const proof = {
    stem,
    templateId,
    pxPerIn: PX_PER_IN,
    cornerRadiusIn: CORNER_RADIUS_IN,
    ...sizes,
    files: { bleedName, dieName, mockupName, compareName },
  };
  writeFileSync(
    join(outDir, "compare", `${stem}-sizes.json`),
    JSON.stringify(proof, null, 2),
  );

  return proof;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const parent = get("--parent");
  const templateId = get("--template");
  const stem = get("--stem");
  const coverPosition = get("--cover-position") || "centre";
  const outDir =
    get("--out") ||
    join(root, "app/temp/Color Custom Badges/plan2-rect-parents");

  if (!parent || !templateId || !stem) {
    console.log(`Usage:
  node scripts/cut-die-from-rect-parent.mjs \\
    --parent path/to/rect.png --template rect-1_5x3 --stem Coast-1.5x3 \\
    [--cover-position centre|bottom|top|left|right]

Templates: ${Object.keys(TEMPLATES).join(", ")}
Sizes @ ${PX_PER_IN} px/in:`);
    for (const id of Object.keys(TEMPLATES)) {
      const s = sizesForTemplate(id);
      console.log(
        `  ${id}: bleed ${s.bleedW}×${s.bleedH}, die ${s.dieW}×${s.dieH}, r=${s.radiusPx}px`,
      );
    }
    process.exit(parent ? 1 : 0);
  }

  if (!existsSync(parent)) {
    console.error("Missing parent:", parent);
    process.exit(1);
  }

  const proof = await processParent({
    parentPath: parent,
    templateId,
    stem,
    outDir,
    coverPosition,
  });
  console.log("✓", JSON.stringify(proof, null, 2));
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
