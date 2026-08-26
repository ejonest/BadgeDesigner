/**
 * Builds the transparent wood-tone thumbnails for step 1 of the gavel designer.
 *
 * Unlike scripts/build-gavel-option-photos.mjs, which flattens to white and
 * leans on a blend mode, these keep a real alpha channel so the cards work on
 * any background. The studio backdrop is flooded from the borders, and the soft
 * drop shadow is re-encoded as translucent black rather than being cut away, so
 * the product still sits on a shadow instead of floating.
 *
 * Usage: node scripts/build-gavel-wood-thumbs.mjs
 */
import path from "node:path";
import sharp from "sharp";

const SRC_DIR =
  "app/temp/Gavels Fast - Core Products/Gavels & Sound Blocks (Walnut, Rubberwood, Ebony)";
const OUT_DIR = "public/images/gavel";

/** Cards render at ~150 CSS px wide; this covers 2x on retina. */
const MAX_W = 520;
const MAX_H = 420;

const JOBS = [
  {
    src: "Walnut Gavel & Square Sound Block (Gold).png",
    out: "thumb-walnut.png",
  },
  {
    src: "Rubberwood-Gavel-and-Sound-Block-Gold.png",
    out: "thumb-rubberwood.png",
  },
  { src: "Ebony-Gavel-and-Sound-Block-Gold.jpg", out: "thumb-ebony.png" },
];

/**
 * Bare backdrop: bright, and neutral enough to cover the slightly grey or
 * slightly blue seamless these shots were lit against.
 */
function isBareBackdrop(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 224 && max - min <= 20;
}

/**
 * The shadow the product casts on that backdrop.
 *
 * Two things separate it from the product: it never gets darker than the floor
 * below, and it stays neutral-to-cool. The warmth test is what protects the
 * wood — a blown-out highlight on walnut is still strongly red-over-blue, while
 * the studio shadow is not — and lit wood is what a plain neutrality test
 * misclassifies, eating notches out of the handle and stand.
 */
const SHADOW_FLOOR = 150;

function isShadow(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= SHADOW_FLOOR && max - min <= 14 && r - b <= 12;
}

function isBackdropOrShadow(r, g, b) {
  return isBareBackdrop(r, g, b) || isShadow(r, g, b);
}

/** Everything at or above this reads as bare backdrop, so it goes fully clear. */
const CLEAR_AT = 247;

/**
 * Flags every backdrop/shadow pixel reachable from the image border.
 *
 * Flooding inward rather than thresholding globally is what keeps bright
 * highlights inside the product opaque: they are fenced off by the darker
 * product edge, so the flood never reaches them.
 */
function floodBackdrop(data, width, height) {
  const isBack = new Uint8Array(width * height);
  const stack = [];

  const consider = (x, y) => {
    const p = y * width + x;
    if (isBack[p]) return;
    const i = p * 3;
    if (!isBackdropOrShadow(data[i], data[i + 1], data[i + 2])) return;
    isBack[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    consider(0, y);
    consider(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) consider(x - 1, y);
    if (x < width - 1) consider(x + 1, y);
    if (y > 0) consider(x, y - 1);
    if (y < height - 1) consider(x, y + 1);
  }
  return isBack;
}

/**
 * Rewrites the flooded region as black at the alpha the shadow implies.
 *
 * A pixel shot on white is `(1 - a)·white + a·black`, so its luminance gives
 * the shadow's alpha directly. Storing black plus that alpha reproduces the
 * shadow over any background instead of only over white.
 */
function toRgbaWithShadowAlpha(rgb, isBack, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const i = p * 3;
    const o = p * 4;
    if (!isBack[p]) {
      out[o] = rgb[i];
      out[o + 1] = rgb[i + 1];
      out[o + 2] = rgb[i + 2];
      out[o + 3] = 255;
      continue;
    }
    const lum = (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
    const alpha = lum >= CLEAR_AT ? 0 : Math.round(255 - lum);
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = alpha;
  }
  return out;
}

/** Tight bounds of anything visible, plus a small breathing margin. */
function contentBox(rgba, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height };

  const pad = Math.round(0.02 * Math.max(maxX - minX, maxY - minY));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return {
    left,
    top,
    width: Math.min(width, maxX + pad + 1) - left,
    height: Math.min(height, maxY + pad + 1) - top,
  };
}

for (const job of JOBS) {
  const srcPath = path.join(SRC_DIR, job.src);
  const outPath = path.join(OUT_DIR, job.out);

  const before = await sharp(srcPath).metadata();
  const { data, info } = await sharp(srcPath)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isBack = floodBackdrop(data, info.width, info.height);
  const rgba = toRgbaWithShadowAlpha(data, isBack, info.width, info.height);
  const box = contentBox(rgba, info.width, info.height);

  const out = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(box)
    .resize({
      width: MAX_W,
      height: MAX_H,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(outPath);

  const cleared =
    isBack.reduce((n, v) => n + v, 0) / (info.width * info.height);
  console.log(
    `${job.out}: ${before.width}×${before.height} -> ${out.width}×${out.height}` +
      ` (${(out.size / 1024).toFixed(0)} kB, ${(cleared * 100).toFixed(0)}% backdrop)`,
  );
}
