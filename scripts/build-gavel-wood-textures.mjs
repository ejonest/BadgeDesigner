/**
 * Builds web-sized PBR maps for the three catalog woods — walnut, rubberwood,
 * and ebony — plus the picker thumbnails.
 *
 * All three share one grain scan (Wood066, CC0 from ambientcg.com, in the
 * gitignored app/temp/gavelImages) and differ only in albedo. The scan supplies
 * pore and figure detail; the color stops below come from the Gavels Fast
 * product photos, measured with scripts/sample-gavel-wood-colors.mjs.
 *
 * Recoloring rather than sourcing three separate scans keeps the woods reading
 * as the same turned part in the same light, which is what the photos show.
 *
 * Usage: node scripts/build-gavel-wood-textures.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "app/temp/gavelImages");
const OUT_DIR = path.join(ROOT, "public/textures/gavel");
const THUMB_DIR = path.join(ROOT, "public/images/gavel");
const SIZE = 1024;
const THUMB_SIZE = 480;

const GRAIN = { zip: "Wood066_4K-JPG.zip", prefix: "Wood066_4K-JPG" };

/**
 * ambientCG wood grain runs across the image, but LatheGeometry maps V along
 * the turned axis — so the maps are rotated 90° CW to put grain down the
 * handle and the head's striking axis.
 */
const ROTATE_DEG = 90;

/**
 * Albedo stops in linear RGB at the 8th / 50th / 90th luminance percentile of
 * the wood pixels in each product photo, pulled down roughly a third from the
 * raw measurement: the photos bake in studio light, and our renderer adds its
 * own, so raw values wash out to a chalky mid-tone on screen.
 *
 * `shape` biases where the scan's midtones land between the stops. Below 1
 * pushes the grain lighter, which keeps figure visible on the dark woods.
 */
const WOODS = [
  {
    id: "walnut",
    dark: [0.048, 0.018, 0.01],
    mid: [0.17, 0.08, 0.048],
    light: [0.39, 0.225, 0.15],
    shape: 0.65,
    roughnessGain: 1,
    roughnessLift: 0,
  },
  {
    id: "rubberwood",
    dark: [0.045, 0.012, 0.008],
    mid: [0.18, 0.055, 0.038],
    light: [0.36, 0.145, 0.1],
    shape: 0.65,
    roughnessGain: 1,
    roughnessLift: 0,
  },
  {
    id: "ebony",
    // Ebony is dyed and filled, so the grain barely reads; the stops sit close
    // together and `shape` is lifted to stop it collapsing to flat black.
    dark: [0.005, 0.006, 0.0075],
    mid: [0.022, 0.024, 0.028],
    light: [0.075, 0.08, 0.09],
    shape: 0.8,
    roughnessGain: 1.24,
    roughnessLift: 14,
  },
];

function srgbToLin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.2;
}

function linToSrgb(x) {
  const y = Math.max(0, Math.min(1, x));
  return Math.round(
    (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.2) - 0.055) * 255,
  );
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function prepare(srcPath) {
  return sharp(srcPath).rotate(ROTATE_DEG).resize(SIZE, SIZE, { fit: "fill" });
}

/**
 * Rotating a tangent-space normal map has to rotate the encoded vectors too.
 * For 90° CW with the OpenGL convention (+G up): R' = G, G' = 255 - R.
 */
async function buildNormal(srcPath, outPath) {
  const { data, info } = await prepare(srcPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    data[i] = g;
    data[i + 1] = 255 - r;
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

async function buildRoughness(srcPath, outPath, gain, lift) {
  const { data, info } = await prepare(srcPath)
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (gain !== 1 || lift !== 0) {
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.min(255, Math.round(data[i] * gain + lift));
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .jpeg({ quality: 82 })
    .toFile(outPath);
}

/**
 * Maps the scan's luminance onto the wood's three color stops, so pore and
 * figure contrast survives the recolor instead of being tinted flat.
 */
async function buildColor(srcPath, outPath, wood) {
  const { data, info } = await prepare(srcPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 3) {
    const lum =
      0.2126 * srgbToLin(data[i]) +
      0.7152 * srgbToLin(data[i + 1]) +
      0.0722 * srgbToLin(data[i + 2]);
    const t = Math.max(0, Math.min(1, (lum ** wood.shape - 0.05) / 0.45));
    const col =
      t < 0.5
        ? mixRgb(wood.dark, wood.mid, t * 2)
        : mixRgb(wood.mid, wood.light, (t - 0.5) * 2);
    data[i] = linToSrgb(col[0]);
    data[i + 1] = linToSrgb(col[1]);
    data[i + 2] = linToSrgb(col[2]);
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

/** Picker swatch — a center crop of the finished albedo, so the two can't drift. */
async function buildThumb(colorPath, outPath) {
  await sharp(colorPath)
    .extract({
      left: Math.round(SIZE * 0.18),
      top: Math.round(SIZE * 0.18),
      width: Math.round(SIZE * 0.64),
      height: Math.round(SIZE * 0.64),
    })
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "fill" })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

function logSizes(id, dir) {
  const sizes = ["color.jpg", "normal.jpg", "roughness.jpg"].map((f) => {
    const kb = Math.round(statSync(path.join(dir, f)).size / 1024);
    return `${f} ${kb}KB`;
  });
  console.log(`${id}: ${sizes.join(", ")}`);
}

async function main() {
  const work = mkdtempSync(path.join(tmpdir(), "gavel-wood-"));
  try {
    const zipPath = path.join(SRC_DIR, GRAIN.zip);
    statSync(zipPath);
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", work]);
    const src = (suffix) => path.join(work, `${GRAIN.prefix}_${suffix}.jpg`);

    mkdirSync(THUMB_DIR, { recursive: true });

    for (const wood of WOODS) {
      const outDir = path.join(OUT_DIR, wood.id);
      mkdirSync(outDir, { recursive: true });

      const colorPath = path.join(outDir, "color.jpg");
      await buildColor(src("Color"), colorPath, wood);
      await buildNormal(src("NormalGL"), path.join(outDir, "normal.jpg"));
      await buildRoughness(
        src("Roughness"),
        path.join(outDir, "roughness.jpg"),
        wood.roughnessGain,
        wood.roughnessLift,
      );
      await buildThumb(colorPath, path.join(THUMB_DIR, `thumb-${wood.id}.jpg`));
      logSizes(wood.id, outDir);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
