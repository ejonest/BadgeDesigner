/**
 * Rebuild print bleeds directly from each background's product mockup.
 *
 * The generative plan2 parents are not faithful to every design — some add
 * motifs, some drop framing, one letterboxes the badge — and the printed badge
 * has to match the proof the shopper approved. Building from the mockup keeps
 * the die pixel-for-pixel the customer's artwork and only invents the overhang
 * outside the trim.
 *
 * The crop handed to the edge finder is the calibrated `badgeFaceRectNorm`,
 * which sits a few pixels into the surrounding page — exactly what the painted
 * edge detector needs to walk inward from.
 *
 * Usage:
 *   node scripts/rebuild-bleeds-from-mockups.mjs --list
 *   node scripts/rebuild-bleeds-from-mockups.mjs Education Coffee
 *   node scripts/rebuild-bleeds-from-mockups.mjs --all
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { runBleedJobs } from "./lib/mockup-bleed.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public/badge-custom-backgrounds");
const config = JSON.parse(
  readFileSync(join(root, "app/data/badge-custom-backgrounds.local.json"), "utf8"),
);

function stemFor(fileName) {
  return fileName
    .replace(/-Badge-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "");
}

/**
 * Bounding box of everything that is not page, i.e. the badge plus its drop
 * shadow. Several `badgeFaceRectNorm` values are wider than the badge — one
 * spans the full canvas — which starves the painted-edge detector and makes it
 * fall back to a fixed inset. Measuring the mockup is more reliable, and the
 * box lands on the shadow, which is exactly where the detector wants to start.
 */
async function contentBox(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const luma = (x, y) => {
    const i = (y * width + x) * 3;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  const page = luma(4, 4);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.abs(luma(x, y) - page) > 6) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function calibratedBox(entry, width, height) {
  const face = entry.badgeFaceRectNorm;
  if (!face) return null;
  const left = Math.max(0, Math.round(face.xNorm * width));
  const top = Math.max(0, Math.round(face.yNorm * height));
  return {
    left,
    top,
    width: Math.min(width - left, Math.round(face.widthNorm * width)),
    height: Math.min(height - top, Math.round(face.heightNorm * height)),
  };
}

async function jobFor(entry) {
  const sourcePath = join(publicDir, entry.fileName);
  if (!existsSync(sourcePath)) {
    throw new Error(`missing mockup ${entry.fileName}`);
  }
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width || config.canvasWidthPx;
  const height = meta.height || config.canvasHeightPx;
  const calibrated = calibratedBox(entry, width, height);
  const measured = await contentBox(sourcePath);

  // The badge is a flat rectangle in these shots, so its box should match the
  // template aspect. Take whichever box is closer to it.
  const target = entry.templateId === "rect-1x3" ? 3 : 2;
  const error = (box) =>
    box ? Math.abs(box.width / box.height - target) / target : Infinity;
  const crop = error(measured) <= error(calibrated) ? measured : calibrated;
  if (!crop) throw new Error("could not locate the badge in the mockup");

  return {
    stem: stemFor(entry.fileName),
    templateId: entry.templateId,
    sourcePath,
    crop,
    cropSource: crop === measured ? "measured" : "calibrated",
    aspectError: Number(error(crop).toFixed(4)),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const filters = args
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toLowerCase());
  const all = args.includes("--all");
  const listOnly = args.includes("--list");
  if (!all && !filters.length && !listOnly) {
    console.log("Pass --all, --list, or one or more name filters.");
    process.exit(1);
  }

  const targets = config.backgrounds.filter((entry) => {
    if (all || listOnly) return true;
    const stem = stemFor(entry.fileName).toLowerCase();
    return filters.some((f) => stem.includes(f));
  });

  if (listOnly) {
    for (const entry of targets) console.log(stemFor(entry.fileName));
    return;
  }

  const failures = [];
  for (const entry of targets) {
    const stem = stemFor(entry.fileName);
    try {
      const job = await jobFor(entry);
      console.log(
        `  crop from ${job.cropSource} box, aspect error ${job.aspectError}`,
      );
      await runBleedJobs([job]);
    } catch (err) {
      failures.push({ stem, message: err.message || String(err) });
      console.error(`✗ ${stem}: ${err.message || err}`);
    }
  }

  console.log(
    `\n${targets.length - failures.length}/${targets.length} rebuilt`,
  );
  if (failures.length) {
    console.log("failed:");
    for (const f of failures) console.log(`  ${f.stem} — ${f.message}`);
  }
}

await main();
