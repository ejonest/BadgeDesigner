/**
 * Install the plan2 full-rectangle print bleeds into public/badge-custom-backgrounds.
 *
 * The older assets in public/ were cut from the photographed mockups and kept
 * the badge silhouette — rounded corners plus the white page and its drop
 * shadow — inside the bleed, which prints as a white outline on the cut edge.
 * The plan2 print-bleed set is a true sharp rectangle at 500 px/in with art
 * running past the trim on every side.
 *
 * Usage:
 *   node scripts/install-plan2-print-bleeds.mjs            # report only
 *   node scripts/install-plan2-print-bleeds.mjs --write     # install
 *   node scripts/install-plan2-print-bleeds.mjs --write Education Transit
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { sizesForTemplate } from "./cut-die-from-rect-parent.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const bleedDir = join(
  root,
  "app/temp/Color Custom Badges/plan2-rect-parents/print-bleed",
);
const publicDir = join(root, "public/badge-custom-backgrounds");
const backupDir = join(root, "app/temp/qa/public-bleed-backup");

const config = JSON.parse(
  readFileSync(join(root, "app/data/badge-custom-backgrounds.local.json"), "utf8"),
);

/** Same mapping the app uses in app/utils/badgeCustomBackgrounds.ts. */
function previewToBleedFileName(fileName) {
  const base = fileName
    .replace(/-Badge-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "");
  return `${base}-bleed.png`;
}

async function run() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const filters = args
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toLowerCase());

  const results = [];
  for (const entry of config.backgrounds) {
    const bleedName = previewToBleedFileName(entry.fileName);
    if (
      filters.length &&
      !filters.some((f) => bleedName.toLowerCase().includes(f))
    ) {
      continue;
    }
    const src = join(bleedDir, bleedName);
    if (!existsSync(src)) {
      results.push({ bleedName, status: "missing_plan2" });
      continue;
    }

    const sizes = sizesForTemplate(entry.templateId);
    const meta = await sharp(src).metadata();
    if (meta.width !== sizes.bleedW || meta.height !== sizes.bleedH) {
      results.push({
        bleedName,
        status: "wrong_size",
        detail: `${meta.width}×${meta.height}, expected ${sizes.bleedW}×${sizes.bleedH}`,
      });
      continue;
    }

    const dst = join(publicDir, bleedName);
    if (existsSync(dst)) {
      const a = readFileSync(src);
      const b = readFileSync(dst);
      if (a.equals(b)) {
        results.push({ bleedName, status: "already_current" });
        continue;
      }
    }

    if (write) {
      if (existsSync(dst)) {
        mkdirSync(backupDir, { recursive: true });
        copyFileSync(dst, join(backupDir, bleedName));
      }
      copyFileSync(src, dst);
    }
    results.push({ bleedName, status: write ? "installed" : "would_install" });
  }

  const byStatus = new Map();
  for (const r of results) {
    if (!byStatus.has(r.status)) byStatus.set(r.status, []);
    byStatus.get(r.status).push(r);
  }
  for (const [status, list] of byStatus) {
    console.log(`\n${status} (${list.length})`);
    for (const r of list) {
      console.log(`  ${r.bleedName}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  if (!write) {
    console.log("\nReport only. Re-run with --write to install.");
  } else {
    console.log(`\nReplaced files backed up to ${backupDir}`);
  }
}

await run();
