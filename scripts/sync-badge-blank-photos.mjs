#!/usr/bin/env node
/**
 * Copy blank badge product photos from app/temp/Real Images to public/badge-blanks/.
 * Re-run when new shapes or colors are added to the temp folder.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "app/temp/Real Images");
const dest = path.join(root, "public/badge-blanks");

if (!existsSync(src)) {
  console.error(`Source not found: ${src}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

for (const entry of readdirSync(src)) {
  const from = path.join(src, entry);
  const to = path.join(dest, entry);
  cpSync(from, to, { recursive: true, force: true });
  console.log(`Synced ${entry}`);
}

console.log(`Done. Photos available under ${dest}`);
