/**
 * Rebuilds the pen designer preview photos from the vendor product shots.
 *
 * The vendor images carry marketing callouts ("ADD YOUR LOGO OR CUSTOM
 * MESSAGE"), a pointer arrow, the vendor's own case-band logo, and a sample
 * "NORTHRIDGE" pen engraving. None of that may show up behind a customer's
 * artwork, so the affected pixels are masked and refilled.
 *
 * Every pixel gets a surface label (silver plate, band front, case body,
 * studio background, pen cap). Fills never read across a label boundary, which
 * is what keeps the case silhouette and the plate border crisp. Large smooth
 * surfaces are refilled from a least-squares quadratic fit of their own clean
 * pixels; small holes are refilled by Laplace relaxation.
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
const CASE_BODY = 0;
const PLATE = 1;
const BACKDROP = 2;
const BAND_FRONT = 3;
const PEN_CAP = 4;

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

/**
 * Laplace relaxation with label barriers: masked pixels converge to the
 * harmonic interpolation of the clean pixels sharing their label.
 */
function fillRelax(image, mask, labels, allowed, sweeps) {
  const { data, W, H, channels } = image;
  const targets = [];
  for (let i = 0; i < W * H; i++) {
    if (mask[i] && allowed.includes(labels[i])) targets.push(i);
  }
  if (!targets.length) return;

  for (let c = 0; c < 3; c++) {
    const seed = new Map();
    for (let i = 0; i < W * H; i++) {
      if (mask[i] || !allowed.includes(labels[i])) continue;
      const entry = seed.get(labels[i]) ?? [0, 0];
      entry[0] += data[i * channels + c];
      entry[1] += 1;
      seed.set(labels[i], entry);
    }
    for (const i of targets) {
      const entry = seed.get(labels[i]);
      data[i * channels + c] = entry ? entry[0] / entry[1] : 128;
    }

    for (let s = 0; s < sweeps; s++) {
      const forward = s % 2 === 0;
      for (let k = 0; k < targets.length; k++) {
        const i = targets[forward ? k : targets.length - 1 - k];
        const x = i % W;
        const y = (i - x) / W;
        const label = labels[i];
        let sum = 0;
        let n = 0;
        if (x > 0 && labels[i - 1] === label) {
          sum += data[(i - 1) * channels + c];
          n++;
        }
        if (x < W - 1 && labels[i + 1] === label) {
          sum += data[(i + 1) * channels + c];
          n++;
        }
        if (y > 0 && labels[i - W] === label) {
          sum += data[(i - W) * channels + c];
          n++;
        }
        if (y < H - 1 && labels[i + W] === label) {
          sum += data[(i + W) * channels + c];
          n++;
        }
        if (n) data[i * channels + c] = sum / n;
      }
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
    } else if (labels[i] === PLATE || labels[i] === PEN_CAP) {
      rgb[o + 1] = Math.min(255, rgb[o + 1] + 70);
    } else if (labels[i] === BAND_FRONT) {
      rgb[o + 2] = Math.min(255, rgb[o + 2] + 90);
    }
  }
  await sharp(rgb, { raw: { width: W, height: H, channels } })
    .png()
    .toFile(path.join(DEBUG_DIR, `${name}-mask.png`));
}

async function save(image, file) {
  const { data, W, H, channels } = image;
  await sharp(data, { raw: { width: W, height: H, channels } })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT_DIR, file));
  console.log(`${file} ${W}x${H}`);
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
/** Band front face: the same fold edge dropped down the lid. */
const CASE_BAND_FRONT = [
  [353, 307],
  [445, 268],
  [441, 296],
  [349, 333],
];
/**
 * Lower-right silhouette of the case, least-squares fitted to the luminance
 * crossing over the columns that the arrow and marketing copy leave alone.
 */
const caseEdgeY = (x) => 525.3 - 0.4557 * x;

async function cleanCasePhoto() {
  const image = await loadImage(path.join(SRC_DIR, "611im5egb6L._AC_SX679_.jpg"));
  const { data, W, H, channels } = image;
  const labels = new Int8Array(W * H);
  const mask = new Uint8Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (insideQuad(CASE_BAND_TOP, x, y, -2)) labels[i] = PLATE;
      else if (insideQuad(CASE_BAND_FRONT, x, y, -2)) labels[i] = BAND_FRONT;
      else if (y > caseEdgeY(x) + 2) labels[i] = BACKDROP;
      else labels[i] = CASE_BODY;
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * channels;
      const r = data[o];
      const b = data[o + 2];

      // Rebuild the whole plate interior: the vendor crown is gold and the
      // wordmark is a soft grey, so no threshold catches every stroke.
      if (labels[i] === PLATE && insideQuad(CASE_BAND_TOP, x, y, -8)) {
        mask[i] = 1;
      }

      // Marketing copy: clear the whole backdrop block it sits in so no
      // anti-aliased halo survives.
      if (labels[i] === BACKDROP && x > 336 && y > 326 && y < 505) {
        mask[i] = 1;
      }

      // Pointer arrow: the only warm-toned thing in the frame.
      if (x > 396 && x < 486 && y > 254 && y < 362 && r - b > 14 && r > 60) {
        mask[i] = 1;
      }
    }
  }

  const grown = dilateWithinLabels(mask, labels, W, H, 4);
  // Keep the grown arrow mask off the plate's border ring.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!grown[i]) continue;
      if (labels[i] === PLATE && !insideQuad(CASE_BAND_TOP, x, y, -6)) {
        grown[i] = 0;
      }
    }
  }

  await writeDebug("case", image, grown, labels);
  fillSurfaceFit(image, grown, labels, PLATE);
  fillSurfaceFit(image, grown, labels, BACKDROP, (x, y, i) => {
    const o = i * channels;
    // Ignore the drop shadow and any residual dark ink when fitting.
    return y < 505 && luma(data[o], data[o + 1], data[o + 2]) > 188;
  });
  fillRelax(image, grown, labels, [CASE_BODY, BAND_FRONT], 2600);

  await save(image, "case-band.jpg");
}

/* ------------------------------------------------------------------ */
/* Open gift set: sample engraving on the pen cap                     */
/* ------------------------------------------------------------------ */

const GIFT_CAP = [
  [222, 377],
  [334, 343],
  [340, 371],
  [226, 401],
];

async function cleanGiftSetPhoto() {
  const image = await loadImage(path.join(SRC_DIR, "61ZqCMEGO3L._AC_SX679_.jpg"));
  const { data, W, H, channels } = image;
  const labels = new Int8Array(W * H).fill(NONE);
  const mask = new Uint8Array(W * H);

  for (let y = 330; y < 410; y++) {
    for (let x = 210; x < 350; x++) {
      const i = y * W + x;
      if (!insideQuad(GIFT_CAP, x, y, -1)) continue;
      labels[i] = PEN_CAP;
      if (!insideQuad(GIFT_CAP, x, y, -5)) continue;
      const o = i * channels;
      if (luma(data[o], data[o + 1], data[o + 2]) > 133) mask[i] = 1;
    }
  }

  const grown = dilateWithinLabels(mask, labels, W, H, 3);

  await writeDebug("giftset", image, grown, labels);
  fillRelax(image, grown, labels, [PEN_CAP], 1400);

  await save(image, "gift-set.jpg");
}

/**
 * The cap close-up needs no retouching, but the vendor ships it square with a
 * lot of empty studio above and below the pen. Cropping to the pen keeps the
 * preview panel from being mostly whitespace.
 */
const CAP_CROP = { left: 0, top: 128, width: 400, height: 168 };

async function cropCapPhoto() {
  await sharp(path.join(SRC_DIR, "3b6d194ce6d242bf246e46e953acb6e6._SS400_.jpg"))
    .extract(CAP_CROP)
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT_DIR, "pen-cap.jpg"));
  console.log(
    `pen-cap.jpg ${CAP_CROP.width}x${CAP_CROP.height} (unbranded; cropped to the pen)`,
  );
}

await mkdir(OUT_DIR, { recursive: true });
await cleanCasePhoto();
await cleanGiftSetPhoto();
await cropCapPhoto();
