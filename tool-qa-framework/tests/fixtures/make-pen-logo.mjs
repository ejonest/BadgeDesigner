/**
 * Builds a test logo for the pen designer: a coloured mark on an opaque white
 * background, which is the case the black-ink conversion has to strip before
 * the art can be engraved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(import.meta.dirname, "out");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="600" height="380" fill="#ffffff"/>
  <g fill="#c8962a">
    <path d="M90 300 L60 120 L165 200 L240 90 L315 200 L420 120 L390 300 Z"/>
    <rect x="70" y="315" width="330" height="40" rx="8"/>
  </g>
  <circle cx="480" cy="180" r="70" fill="#1f4e79"/>
  <text x="480" y="200" font-family="Arial" font-size="64" font-weight="700"
        fill="#ffffff" text-anchor="middle">AQ</text>
</svg>`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "pen-logo.svg"), svg);
await sharp(Buffer.from(svg)).png().toFile(path.join(OUT_DIR, "pen-logo.png"));
console.log("wrote", path.join(OUT_DIR, "pen-logo.png"));
