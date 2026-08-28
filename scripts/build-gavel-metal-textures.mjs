/**
 * Builds web-sized PBR maps for the two catalog metal finishes — gold and
 * silver — used by the gavel band and the stand plaque.
 *
 * Source scans are ambientCG Metal042A (gold) and Metal041A (silver), CC0, kept
 * in the gitignored app/temp. They supply the micro-relief that stops the metal
 * reading as a flat vector fill; the hues come from the Gavels Fast product
 * photos and are not taken from the scans.
 *
 * Two deliberate departures from the raw scans:
 *
 *  - The albedo is high-passed. The scans carry broad cloudy mottling that, at
 *    the scale a band or plaque is rendered, looks like tarnish under the
 *    engraving and costs the text its contrast. Only the fine detail survives.
 *  - Roughness is remapped well above the scanned values. These scans are
 *    near-mirror, which is exactly the blown-out glare we are avoiding; the
 *    product hardware is brushed and scatters its highlight.
 *
 * A directional brush is added to the albedo, roughness and normal, since the
 * scans are hammered rather than brushed.
 *
 * Usage: node scripts/build-gavel-metal-textures.mjs
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "app/temp");
const OUT_DIR = path.join(ROOT, "public/textures/gavel");
const SIZE = 1024;

/**
 * Finish hues in linear RGB, measured off the stand plaques in the product
 * photos (see the gold and silver "Front-Face" shots). `detail` and `brush` are
 * how far the scan's micro-relief and the brush pass swing the albedo either
 * side of that hue.
 */
const METALS = [
  {
    id: "metal-gold",
    scan: "Metal042A",
    base: [0.686, 0.377, 0.043],
    detail: 0.08,
    brush: 0.09,
    roughness: [0.48, 0.66],
  },
  {
    id: "metal-silver",
    scan: "Metal041A",
    base: [0.498, 0.486, 0.462],
    detail: 0.08,
    brush: 0.095,
    roughness: [0.5, 0.68],
  },
];

/**
 * Brush lines run the length of the surface, so the grain varies down Y only.
 * Periods are in texels, and the maps are tiled at native size, so these are
 * the real widths of the brush strokes on the finished part.
 */
const BRUSH_OCTAVES = [
  { period: 2, weight: 0.34 },
  { period: 5, weight: 0.3 },
  { period: 17, weight: 0.22 },
  { period: 63, weight: 0.14 },
];

function linToSrgb(x) {
  const y = Math.max(0, Math.min(1, x));
  return Math.round(
    (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.2) - 0.055) * 255,
  );
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One brush value per row, in −1..1. Summing octaves whose periods divide the
 * texture height keeps the pattern seamless when it tiles.
 */
function brushRows(height, seed) {
  const rand = mulberry32(seed);
  const rows = new Float32Array(height);
  let norm = 0;
  for (const { period, weight } of BRUSH_OCTAVES) {
    const steps = Math.max(2, Math.round(height / period));
    const knots = new Float32Array(steps);
    for (let i = 0; i < steps; i++) knots[i] = rand() * 2 - 1;
    for (let y = 0; y < height; y++) {
      const p = (y / height) * steps;
      const i0 = Math.floor(p) % steps;
      const i1 = (i0 + 1) % steps;
      const f = p - Math.floor(p);
      rows[y] += (knots[i0] + (knots[i1] - knots[i0]) * (f * f * (3 - 2 * f))) * weight;
    }
    norm += weight;
  }
  for (let y = 0; y < height; y++) rows[y] /= norm;
  return rows;
}

function findScanDir(scan) {
  const match = readdirSync(SRC_DIR).find(
    (name) =>
      name.startsWith(`${scan}_4K-JPG`) &&
      statSync(path.join(SRC_DIR, name)).isDirectory() &&
      existsSync(path.join(SRC_DIR, name, `${scan}_4K-JPG_Color.jpg`)),
  );
  if (!match) {
    throw new Error(
      `No ${scan} scan under app/temp. Download the 4K-JPG set from ambientcg.com.`,
    );
  }
  return path.join(SRC_DIR, match);
}

async function grey(srcPath) {
  return await sharp(srcPath)
    .resize(SIZE, SIZE, { fit: "fill" })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
}

/**
 * Fine relief only: the scan's luminance minus a blurred copy of itself. The
 * blur radius is what separates "surface texture" from "cloudy patch".
 */
async function scanDetail(srcPath) {
  const sharp0 = sharp(srcPath).resize(SIZE, SIZE, { fit: "fill" }).greyscale().removeAlpha();
  const flat = await sharp0.clone().raw().toBuffer();
  const blurred = await sharp0.clone().blur(SIZE / 96).raw().toBuffer();

  const detail = new Float32Array(flat.length);
  let peak = 0;
  for (let i = 0; i < flat.length; i++) {
    detail[i] = (flat[i] - blurred[i]) / 255;
    peak = Math.max(peak, Math.abs(detail[i]));
  }
  if (peak > 0) for (let i = 0; i < detail.length; i++) detail[i] /= peak;
  return detail;
}

async function buildColor(scanDir, metal, outPath) {
  const detail = await scanDetail(
    path.join(scanDir, `${metal.scan}_4K-JPG_Color.jpg`),
  );
  const rows = brushRows(SIZE, 0x9e3779b9 ^ metal.id.length);

  const out = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    const brush = rows[y] * metal.brush;
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const gain = 1 + detail[i] * metal.detail + brush;
      out[i * 3] = linToSrgb(metal.base[0] * gain);
      out[i * 3 + 1] = linToSrgb(metal.base[1] * gain);
      out[i * 3 + 2] = linToSrgb(metal.base[2] * gain);
    }
  }

  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

/**
 * The scans are near-mirror, so their roughness is renormalized onto a matte
 * brushed range instead of being used as measured.
 */
async function buildRoughness(scanDir, metal, outPath) {
  const src = await grey(path.join(scanDir, `${metal.scan}_4K-JPG_Roughness.jpg`));
  const rows = brushRows(SIZE, 0x85ebca6b ^ metal.id.length);

  let min = 255;
  let max = 0;
  for (const v of src) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1, max - min);
  const [lo, hi] = metal.roughness;

  const out = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    // Brushed metal is roughest across the grain, which is what spreads the
    // highlight into a streak instead of a point.
    const brush = rows[y] * 0.06;
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const t = (src[i] - min) / span;
      out[i] = Math.max(0, Math.min(255, Math.round((lo + (hi - lo) * t + brush) * 255)));
    }
  }

  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .jpeg({ quality: 86 })
    .toFile(outPath);
}

/** Scanned relief, with the brush cut into the across-grain (green) axis. */
async function buildNormal(scanDir, metal, outPath) {
  const { data, info } = await sharp(
    path.join(scanDir, `${metal.scan}_4K-JPG_NormalGL.jpg`),
  )
    .resize(SIZE, SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rows = brushRows(SIZE, 0xc2b2ae35 ^ metal.id.length);
  for (let y = 0; y < info.height; y++) {
    const slope = (rows[y] - rows[(y + 1) % info.height]) * 90;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + slope));
    }
  }

  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

async function main() {
  for (const metal of METALS) {
    const scanDir = findScanDir(metal.scan);
    const outDir = path.join(OUT_DIR, metal.id);
    mkdirSync(outDir, { recursive: true });

    await buildColor(scanDir, metal, path.join(outDir, "color.jpg"));
    await buildRoughness(scanDir, metal, path.join(outDir, "roughness.jpg"));
    await buildNormal(scanDir, metal, path.join(outDir, "normal.jpg"));

    const sizes = ["color.jpg", "normal.jpg", "roughness.jpg"].map((f) => {
      const kb = Math.round(statSync(path.join(outDir, f)).size / 1024);
      return `${f} ${kb}KB`;
    });
    console.log(`${metal.id}: ${sizes.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
