/**
 * Rebuilds the pen designer preview photos from the vendor product shots.
 *
 * Two things are wrong with the shots as delivered. The case photo carries the
 * vendor's own logo on the engraving plate, which may not show up behind a
 * customer's artwork, so those pixels are masked and refilled: every pixel
 * gets a surface label, fills never read across a label boundary (which is
 * what keeps the plate border crisp), and the plate is rebuilt from a
 * least-squares quadratic fit of its own clean pixels. Every shot is also
 * framed square with the product across the middle, so each one is cropped to
 * the product rather than letting empty studio backdrop eat the preview panel.
 *
 * Usage:
 *   node scripts/clean-pen-photos.mjs           # write public/images/pen/*
 *   node scripts/clean-pen-photos.mjs --debug   # also write mask previews
 */
/* eslint-env node */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "app/temp/PenImages");
const OUT_DIR = path.join(ROOT, "public/images/pen");
const DEBUG_DIR = path.join(ROOT, ".tmp-pen");
const DEBUG = process.argv.includes("--debug");

const NONE = -1;
const PLATE = 1;

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Point-in-quad test. `grow` expands (positive) or shrinks (negative) the quad
 * by that many pixels, measured along each edge's outward normal.
 */
function insideQuad(quad, x, y, grow = 0) {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i];
    const [bx, by] = quad[(i + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = (by - ay) / len;
    let ny = -(bx - ax) / len;
    if (nx * (cx - ax) + ny * (cy - ay) > 0) {
      nx = -nx;
      ny = -ny;
    }
    if (nx * (x - ax) + ny * (y - ay) > grow) return false;
  }
  return true;
}

/**
 * Grows the mask by `radius`, but never past the edge of the surface a pixel
 * belongs to. Letting growth cross a label boundary is what turns a soft
 * silhouette into a hard staircase, because the neighbouring surface's fill
 * then claims pixels that belong to the case outline.
 */
function dilateWithinLabels(mask, labels, W, H, radius) {
  if (radius <= 0) return mask;
  const out = new Uint8Array(mask);
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (labels[j] === labels[i]) out[j] = 1;
      }
    }
  }
  return out;
}

function solve(matrix, rhs) {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(matrix[r][col]) > Math.abs(matrix[pivot][col])) pivot = r;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    for (let r = col + 1; r < n; r++) {
      const f = matrix[r][col] / matrix[col][col];
      if (!f) continue;
      for (let c = col; c < n; c++) matrix[r][c] -= f * matrix[col][c];
      rhs[r] -= f * rhs[col];
    }
  }
  const out = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = rhs[r];
    for (let c = r + 1; c < n; c++) sum -= matrix[r][c] * out[c];
    out[r] = sum / matrix[r][r];
  }
  return out;
}

/**
 * Refills masked pixels of one label from a quadratic surface fitted to that
 * label's clean pixels. Suited to large smooth areas (studio backdrop, brushed
 * plate) where relaxation would need an impractical number of sweeps.
 */
function fillSurfaceFit(image, mask, labels, label, sampleOk) {
  const { data, W, H, channels } = image;
  const targets = [];
  const samples = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (labels[i] !== label) continue;
      if (mask[i]) targets.push(i);
      else if (!sampleOk || sampleOk(x, y, i)) samples.push(i);
    }
  }
  if (!targets.length) return;
  if (samples.length < 60) throw new Error(`too few samples for label ${label}`);

  const basis = (x, y) => {
    const u = (x - W / 2) / W;
    const v = (y - H / 2) / H;
    return [1, u, v, u * u, u * v, v * v];
  };

  for (let c = 0; c < 3; c++) {
    const ata = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const atb = new Array(6).fill(0);
    for (const i of samples) {
      const x = i % W;
      const b = basis(x, (i - x) / W);
      const value = data[i * channels + c];
      for (let r = 0; r < 6; r++) {
        atb[r] += b[r] * value;
        for (let k = 0; k < 6; k++) ata[r][k] += b[r] * b[k];
      }
    }
    const coeff = solve(ata, atb);
    if (!coeff) throw new Error(`fit failed for label ${label}`);
    for (const i of targets) {
      const x = i % W;
      const b = basis(x, (i - x) / W);
      let value = 0;
      for (let r = 0; r < 6; r++) value += coeff[r] * b[r];
      data[i * channels + c] = Math.max(0, Math.min(255, value));
    }
  }
}

async function loadImage(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, channels: info.channels };
}

async function writeDebug(name, image, mask, labels) {
  if (!DEBUG) return;
  const { data, W, H, channels } = image;
  await mkdir(DEBUG_DIR, { recursive: true });
  const rgb = Buffer.from(data);
  for (let i = 0; i < W * H; i++) {
    const o = i * channels;
    if (mask[i]) {
      rgb[o] = 255;
      rgb[o + 1] = 0;
      rgb[o + 2] = 0;
    } else if (labels[i] === PLATE) {
      rgb[o + 1] = Math.min(255, rgb[o + 1] + 70);
    }
  }
  await sharp(rgb, { raw: { width: W, height: H, channels } })
    .png()
    .toFile(path.join(DEBUG_DIR, `${name}-mask.png`));
}

async function save(image, file, crop) {
  const { data, W, H, channels } = image;
  const pipeline = sharp(data, { raw: { width: W, height: H, channels } });
  if (crop) pipeline.extract(crop);
  await pipeline
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT_DIR, file));
  console.log(
    crop
      ? `${file} ${crop.width}x${crop.height} (cropped from ${W}x${H})`
      : `${file} ${W}x${H}`,
  );
}

/* ------------------------------------------------------------------ */
/* Closed case: silver band on the lid                                */
/* ------------------------------------------------------------------ */

/** Band top face, measured from the source photo (679x679). */
const CASE_BAND_TOP = [
  [288, 233],
  [377, 196],
  [445, 268],
  [353, 307],
];
/**
 * The case sits in a square studio frame with the lid across the middle and a
 * detached drop shadow far below it, so more than half the source photo is
 * empty backdrop. Cropping to the case (plus a small margin) lets the preview
 * panel spend its width on the product instead, which is what decides how
 * large the engraving band reads. Masking runs on the full frame first, since
 * the plate quad and the surface fit are measured against those coordinates.
 */
const CASE_CROP = { left: 70, top: 87, width: 550, height: 380 };

/**
 * Built from the plain studio shot of the closed case. An earlier pass used
 * `611im5egb6L`, whose marketing callouts and pointer arrow overlap the case
 * silhouette; masking those left a grey smear hanging off the lower-right
 * edge and dulled the right end of the band's fold. This shot carries only
 * the vendor's own plate logo, so the lid, fold, silhouette, and backdrop all
 * survive untouched and the single edit is the plate face itself.
 */
async function cleanCasePhoto() {
  const image = await loadImage(path.join(SRC_DIR, "51Ep_MCrA9L._AC_SX679_.jpg"));
  const { W, H } = image;
  const labels = new Int8Array(W * H).fill(NONE);
  const mask = new Uint8Array(W * H);

  const { data, channels } = image;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!insideQuad(CASE_BAND_TOP, x, y, -2)) continue;
      labels[i] = PLATE;

      // Rebuild the plate interior wholesale rather than thresholding the ink:
      // the crown is near-black but the wordmark fades into the brushed
      // silver, so no cutoff catches every stroke without biting the plate.
      if (insideQuad(CASE_BAND_TOP, x, y, -6)) {
        mask[i] = 1;
        continue;
      }

      // The wordmark runs corner to corner and the tips of its first and last
      // letters land inside that margin. Out here the plate is uniform bright
      // silver, so ink is the only thing this dark, and leaving the outer 2px
      // untouched keeps the plate border and corners crisp.
      const o = i * channels;
      if (luma(data[o], data[o + 1], data[o + 2]) < 210) mask[i] = 1;
    }
  }

  const grown = dilateWithinLabels(mask, labels, W, H, 2);
  await writeDebug("case", image, grown, labels);
  fillSurfaceFit(image, grown, labels, PLATE);

  await save(image, "case-band.jpg", CASE_CROP);
}

/* ------------------------------------------------------------------ */
/* Open gift set: the step 1 product card                             */
/* ------------------------------------------------------------------ */

/**
 * Cropped to the open case, leaving out the studio backdrop and the floating
 * drop shadow below it. The card renders this at 94x76 under `object-fit:
 * cover`, so the crop's ratio is kept close to the card's.
 *
 * The pen in this shot carries a sample "ANDERSON" engraving. It survives the
 * crop: at card size it is an unreadable smudge, and the mark reads as the
 * shop's own name rather than a competitor's. Removing it is not the tidy
 * mask-and-refill the case plate gets, because the lettering sits inside the
 * cap's specular highlight rather than on flat matte.
 */
const GIFT_CROP = { left: 91, top: 72, width: 840, height: 712 };

async function cropGiftSetPhoto() {
  await sharp(path.join(SRC_DIR, "Custom-Logo-Pen-Images-in-Box-suspended-black.jpg"))
    .extract(GIFT_CROP)
    .resize({ width: 680 })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT_DIR, "gift-set.jpg"));
  console.log("gift-set.jpg 680x576 (cropped to the case)");
}

/**
 * The cap close-up needs no retouching, but the vendor ships it square with a
 * lot of empty studio above and below the pen. Cropping to the pen keeps the
 * preview panel from being mostly whitespace.
 */
const CAP_CROP = { left: 0, top: 128, width: 400, height: 168 };

async function cropCapPhoto() {
  await sharp(path.join(SRC_DIR, "58955f9cd78fd9895cfdd80130ecf46f._SS400_.jpg"))
    .extract(CAP_CROP)
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT_DIR, "pen-cap.jpg"));
  console.log(
    `pen-cap.jpg ${CAP_CROP.width}x${CAP_CROP.height} (unbranded; cropped to the pen)`,
  );
}

await mkdir(OUT_DIR, { recursive: true });
await cleanCasePhoto();
await cropGiftSetPhoto();
await cropCapPhoto();
