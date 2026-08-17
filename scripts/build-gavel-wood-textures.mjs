/**
 * Builds web-sized PBR maps for the gavel woods from ambientCG source archives.
 *
 * Source zips (CC0, ambientcg.com) live in the gitignored app/temp/gavelImages:
 *   Wood066_4K-JPG.zip          -> walnut
 *   WoodFloor065A_4K-JPG.zip    -> oak (one board cropped out of the floor set)
 *   ebony  = darkened walnut
 *   purple = walnut grain colorized to the stained plum product photos
 *
 * The 4K originals are far too heavy to ship. This downsamples to 1K and keeps
 * only the maps the designer actually uses.
 *
 * Usage: node scripts/build-gavel-wood-textures.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "app/temp/gavelImages");
const OUT_DIR = path.join(ROOT, "public/textures/gavel");
const SIZE = 1024;

const WOODS = [
  { id: "walnut", zip: "Wood066_4K-JPG.zip", prefix: "Wood066_4K-JPG" },
  {
    id: "oak",
    zip: "WoodFloor065A_4K-JPG.zip",
    prefix: "WoodFloor065A_4K-JPG",
    // One board from the floor set, inset from the plank seams so the gavel
    // doesn't read as hardwood flooring wrapped around a lathe.
    crop: { top: 1672, height: 368 },
  },
];

/**
 * ambientCG wood grain runs across the image, but LatheGeometry maps V along
 * the turned axis — so the maps are rotated 90° CW to put grain down the
 * handle and the head's striking axis.
 */
const ROTATE_DEG = 90;

function prepare(srcPath, crop) {
  let img = sharp(srcPath);
  if (crop) {
    img = img.extract({
      left: 0,
      top: crop.top,
      width: 4096,
      height: crop.height,
    });
  }
  return img.rotate(ROTATE_DEG).resize(SIZE, SIZE, { fit: "fill" });
}

/**
 * Rotating a tangent-space normal map has to rotate the encoded vectors too.
 * For 90° CW with the OpenGL convention (+G up): R' = G, G' = 255 - R.
 */
async function rotateNormalMap(srcPath, outPath, crop) {
  const { data, info } = await prepare(srcPath, crop)
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

async function buildColor(srcPath, outPath, crop) {
  await prepare(srcPath, crop)
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(outPath);
}

async function buildRoughness(srcPath, outPath, crop) {
  await prepare(srcPath, crop).greyscale().jpeg({ quality: 82 }).toFile(outPath);
}

function logSizes(id, dir) {
  const sizes = ["color.jpg", "normal.jpg", "roughness.jpg"].map((f) => {
    const kb = Math.round(statSync(path.join(dir, f)).size / 1024);
    return `${f} ${kb}KB`;
  });
  console.log(`${id}: ${sizes.join(", ")}`);
}

/**
 * Crush walnut's albedo toward near-black while keeping the pore/grain
 * contrast. Roughness is lifted so ebony reads more matte than the satin walnut.
 */
async function buildEbonyFromWalnut(walnutDir, ebonyDir) {
  mkdirSync(ebonyDir, { recursive: true });

  const { data, info } = await sharp(path.join(walnutDir, "color.jpg"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const lin = (data[i + c] / 255) ** 2.2;
      const out = (lin * 0.065 + 0.004) ** (1 / 2.2);
      data[i + c] = Math.max(0, Math.min(255, Math.round(out * 255)));
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(path.join(ebonyDir, "color.jpg"));

  copyFileSync(
    path.join(walnutDir, "normal.jpg"),
    path.join(ebonyDir, "normal.jpg"),
  );

  const rough = await sharp(path.join(walnutDir, "roughness.jpg"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < rough.data.length; i++) {
    rough.data[i] = Math.min(255, Math.round(rough.data[i] * 1.28 + 18));
  }
  await sharp(rough.data, {
    raw: {
      width: rough.info.width,
      height: rough.info.height,
      channels: rough.info.channels,
    },
  })
    .jpeg({ quality: 82 })
    .toFile(path.join(ebonyDir, "roughness.jpg"));

  logSizes("ebony", ebonyDir);
}

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
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Recolor walnut's albedo to the stained plum from the product photos while
 * keeping pore/grain contrast. Normal and roughness stay the walnut scan.
 */
async function buildPurpleFromWalnut(walnutDir, purpleDir) {
  mkdirSync(purpleDir, { recursive: true });

  const { data, info } = await sharp(path.join(walnutDir, "color.jpg"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Linear RGB stops sampled off the close-up / product photos, then darkened
  // a step so studio lighting doesn't wash the stain to grey.
  const dark = [0.043, 0.016, 0.029];
  const mid = [0.102, 0.04, 0.065];
  const light = [0.191, 0.081, 0.127];

  for (let i = 0; i < data.length; i += 3) {
    const lum =
      0.2126 * srgbToLin(data[i]) +
      0.7152 * srgbToLin(data[i + 1]) +
      0.0722 * srgbToLin(data[i + 2]);
    const t = Math.max(0, Math.min(1, (lum ** 0.65 - 0.05) / 0.45));
    const col =
      t < 0.5 ? mixRgb(dark, mid, t * 2) : mixRgb(mid, light, (t - 0.5) * 2);
    data[i] = linToSrgb(col[0]);
    data[i + 1] = linToSrgb(col[1]);
    data[i + 2] = linToSrgb(col[2]);
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(path.join(purpleDir, "color.jpg"));

  copyFileSync(
    path.join(walnutDir, "normal.jpg"),
    path.join(purpleDir, "normal.jpg"),
  );
  copyFileSync(
    path.join(walnutDir, "roughness.jpg"),
    path.join(purpleDir, "roughness.jpg"),
  );

  logSizes("purple", purpleDir);
}

async function main() {
  const work = mkdtempSync(path.join(tmpdir(), "gavel-wood-"));
  try {
    for (const wood of WOODS) {
      const zipPath = path.join(SRC_DIR, wood.zip);
      statSync(zipPath);

      const extractDir = path.join(work, wood.id);
      execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);

      const outDir = path.join(OUT_DIR, wood.id);
      mkdirSync(outDir, { recursive: true });

      const src = (suffix) =>
        path.join(extractDir, `${wood.prefix}_${suffix}.jpg`);

      await buildColor(src("Color"), path.join(outDir, "color.jpg"), wood.crop);
      await rotateNormalMap(
        src("NormalGL"),
        path.join(outDir, "normal.jpg"),
        wood.crop,
      );
      await buildRoughness(
        src("Roughness"),
        path.join(outDir, "roughness.jpg"),
        wood.crop,
      );
      logSizes(wood.id, outDir);
    }

    await buildEbonyFromWalnut(
      path.join(OUT_DIR, "walnut"),
      path.join(OUT_DIR, "ebony"),
    );
    await buildPurpleFromWalnut(
      path.join(OUT_DIR, "walnut"),
      path.join(OUT_DIR, "purple"),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
