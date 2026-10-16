/**
 * Builds the flat "proof" tile for each brushed metal finish: the gavel band
 * and stand plate proofs, and the desk sign gold/silver plates.
 *
 * The albedo from build-gavel-metal-textures.mjs is only half of the look in the
 * 3D viewer — the rest is the studio light catching the roughness relief, which
 * lifts the metal toward a paler sheen and picks out the brush lines. A flat
 * image has no light, so this bakes both in:
 *
 *  - The brush is read back out of the albedo and roughness as one value per
 *    row and strengthened. Proofs are drawn at a third of their texel size or
 *    less, which averages the finest strokes away, so only the wider strokes
 *    are kept and they are pushed hard enough to survive the downscale.
 *  - The base is blended toward the light the viewer reflects, measured off the
 *    3D band, so the proof and the spinning model read as the same part.
 *
 * Reads only the committed maps, so it runs without the source scans.
 *
 * Usage: node scripts/build-metal-proof-textures.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEX_DIR = path.join(ROOT, "public/textures/gavel");

/**
 * `sheen` is the reflected light (sRGB) and `lift` how far the base moves
 * toward it. `brush` scales the per-row stroke, in sRGB levels per unit of the
 * normalized brush signal.
 */
const METALS = [
  { id: "metal-gold", sheen: [236, 226, 182], lift: 0.3, brush: 5.5 },
  { id: "metal-silver", sheen: [236, 238, 240], lift: 0.28, brush: 5.5 },
];

/** Strokes narrower than this many texels vanish once a proof is downscaled. */
const MIN_STROKE_TEXELS = 3;

async function load(file, channels) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .toColourspace(channels === 1 ? "b-w" : "srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Mean luminance of each row, which is where a horizontal brush lives. */
function rowProfile({ data, width, height }, channels) {
  const rows = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      sum +=
        channels === 1
          ? data[i]
          : data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    }
    rows[y] = sum / width;
  }
  return rows;
}

/** Wrapping box blur, so the tile stays seamless top to bottom. */
function blurRows(rows, radius) {
  const n = rows.length;
  const out = new Float32Array(n);
  for (let y = 0; y < n; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += rows[(y + k + n) % n];
    out[y] = sum / (radius * 2 + 1);
  }
  return out;
}

/** Wide strokes only, zero-mean and scaled to unit deviation. */
function brushSignal(colorRows, roughRows) {
  const n = colorRows.length;
  const mixed = new Float32Array(n);
  // Rough rows scatter the light, so on the lit model they read darker.
  for (let y = 0; y < n; y++) mixed[y] = colorRows[y] - roughRows[y] * 0.6;
  const fine = blurRows(mixed, Math.floor(MIN_STROKE_TEXELS / 2));
  const broad = blurRows(fine, 24);
  const band = new Float32Array(n);
  let sq = 0;
  for (let y = 0; y < n; y++) {
    band[y] = fine[y] - broad[y];
    sq += band[y] * band[y];
  }
  const sd = Math.sqrt(sq / n) || 1;
  for (let y = 0; y < n; y++) band[y] /= sd;
  return band;
}

async function buildProof(metal) {
  const dir = path.join(TEX_DIR, metal.id);
  const color = await load(path.join(dir, "color.jpg"), 3);
  const rough = await load(path.join(dir, "roughness.jpg"), 1);
  const brush = brushSignal(rowProfile(color, 3), rowProfile(rough, 1));

  const { width, height, data } = color;
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const stroke = Math.max(-2.5, Math.min(2.5, brush[y])) * metal.brush;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const lit = data[i + c] + (metal.sheen[c] - data[i + c]) * metal.lift;
        out[i + c] = Math.max(0, Math.min(255, Math.round(lit + stroke)));
      }
    }
  }

  const outPath = path.join(dir, "proof.jpg");
  await sharp(out, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
  console.log(`${metal.id}: ${path.relative(ROOT, outPath)}`);
}

for (const metal of METALS) {
  await buildProof(metal);
}
