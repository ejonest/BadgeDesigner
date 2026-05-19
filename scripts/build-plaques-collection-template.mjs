#!/usr/bin/env node
/**
 * Build templates/collection.plaques.json from your Ella collection.signage.json
 * plus the plaques hero section.
 *
 * Usage (from repo root):
 *   node scripts/build-plaques-collection-template.mjs path/to/collection.signage.json
 *
 * Output: shopify-theme/templates/collection.plaques.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const signagePath = process.argv[2];
if (!signagePath) {
  console.error(
    "Usage: node scripts/build-plaques-collection-template.mjs <path/to/collection.signage.json>",
  );
  console.error("");
  console.error(
    "Export collection.signage.json from Shopify: Online Store → Themes → Edit code → Templates",
  );
  process.exit(1);
}

const heroFragmentPath = join(
  repoRoot,
  "shopify-theme/templates/collection.plaques.hero-section.json",
);
const outPath = join(repoRoot, "shopify-theme/templates/collection.plaques.json");

const signage = JSON.parse(readFileSync(signagePath, "utf8"));
const heroFragment = JSON.parse(readFileSync(heroFragmentPath, "utf8"));

if (!signage.sections || !Array.isArray(signage.order)) {
  console.error("Invalid collection template JSON: expected sections + order");
  process.exit(1);
}

// Disable duplicate banner on collection-header if present (hero replaces it).
for (const [key, section] of Object.entries(signage.sections)) {
  if (section.type === "collection-header") {
    section.settings = section.settings || {};
    section.settings.show_page_title = false;
    // Ella uses blocks object; remove collection image block if named.
    if (section.blocks && typeof section.blocks === "object") {
      for (const blockId of Object.keys(section.blocks)) {
        const block = section.blocks[blockId];
        if (block?.type === "collection_image" || block?.type === "image") {
          delete section.blocks[blockId];
        }
      }
      if (section.block_order) {
        section.block_order = section.block_order.filter(
          (id) => section.blocks[id],
        );
      }
    }
    signage.sections[key] = section;
  }
}

signage.sections = { ...heroFragment, ...signage.sections };
signage.order = ["plaques_hero", ...signage.order.filter((id) => id !== "plaques_hero")];

writeFileSync(outPath, JSON.stringify(signage, null, 2) + "\n");
console.log("Wrote", outPath);
console.log("Upload to Shopify: templates/collection.plaques.json");
console.log("Also upload: sections/plaques-collection-hero.liquid");
