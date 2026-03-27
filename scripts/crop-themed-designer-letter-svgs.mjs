/**
 * Crop themed Designer sign SVGs exported on letter canvas (8500×11000) down to
 * the correct physical aspect (2×5 → 2.5:1, 2.8×7 → 2.5:1), centered on artwork.
 *
 * Run: node scripts/crop-themed-designer-letter-svgs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { DOMParser } from "xmldom";

const require = createRequire(import.meta.url);
const pathBounds = require("svg-path-bounds");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGN_DIR = path.join(__dirname, "../public/templates/sign");

const JOBS = [
  // 2×5" → 5 / 2 = 2.5
  { file: "Designer Coffee Bean 2x5.svg", widthIn: 5, heightIn: 2 },
  { file: "Designer Golf 2x5.svg", widthIn: 5, heightIn: 2 },
  { file: "Designer House 2x5.svg", widthIn: 5, heightIn: 2 },
  { file: "Designer Money 2x5.svg", widthIn: 5, heightIn: 2 },
  { file: "Designer Recycle 2x5.svg", widthIn: 5, heightIn: 2 },
  // 2.8×7" → 7 / 2.8 = 2.5
  { file: "Designer Coffee Bean 2.8x7.svg", widthIn: 7, heightIn: 2.8 },
  { file: "Designer Golf 2.8x7.svg", widthIn: 7, heightIn: 2.8 },
  { file: "Designer House 2.8x7.svg", widthIn: 7, heightIn: 2.8 },
  { file: "Designer Money 2.8x7.svg", widthIn: 7, heightIn: 2.8 },
  { file: "Designer recycle 2.8x7.svg", widthIn: 7, heightIn: 2.8 },
];

function expandToAspect(box, widthInches, heightInches) {
  const targetAspect = widthInches / heightInches;
  let { x, y, width, height } = box;
  if (!(height > 0)) return box;
  const currentAspect = width / height;
  if (Math.abs(currentAspect - targetAspect) < 0.001) return box;
  if (currentAspect > targetAspect) {
    const newH = width / targetAspect;
    const dh = newH - height;
    y -= dh / 2;
    height = newH;
  } else {
    const newW = height * targetAspect;
    const dw = newW - width;
    x -= dw / 2;
    width = newW;
  }
  return { x, y, width, height };
}

function unionBoundsFromPaths(ds) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const d of ds) {
    const s = (d || "").trim();
    if (!s) continue;
    try {
      const b = pathBounds(s);
      if (!b || !Number.isFinite(b[0])) continue;
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[2]);
      maxY = Math.max(maxY, b[3]);
    } catch {
      // skip invalid path fragments
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function formatViewBox(box) {
  const r = (n) => Math.round(n * 100) / 100;
  return `${r(box.x)} ${r(box.y)} ${r(box.width)} ${r(box.height)}`;
}

function patchRootDimensions(content, widthIn, heightIn, viewBoxStr) {
  let c = content.replace(/\bwidth="[^"]*"/, `width="${widthIn}in"`);
  c = c.replace(/\bheight="[^"]*"/, `height="${heightIn}in"`);
  c = c.replace(/\bviewBox="[^"]*"/, `viewBox="${viewBoxStr}"`);
  return c;
}

function processFile(relPath, widthIn, heightIn) {
  const full = path.join(SIGN_DIR, relPath);
  const raw = fs.readFileSync(full, "utf8");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const paths = doc.getElementsByTagName("path");
  const ds = [];
  for (let i = 0; i < paths.length; i++) {
    const d = paths[i].getAttribute("d");
    if (d) ds.push(d);
  }
  const u = unionBoundsFromPaths(ds);
  if (!u || u.width <= 0 || u.height <= 0) {
    console.error(`[skip] no bounds: ${relPath}`);
    return;
  }
  const pad = Math.max(u.width, u.height) * 0.04;
  let box = {
    x: u.x - pad,
    y: u.y - pad,
    width: u.width + 2 * pad,
    height: u.height + 2 * pad,
  };
  box = expandToAspect(box, widthIn, heightIn);
  const vb = formatViewBox(box);
  const out = patchRootDimensions(raw, widthIn, heightIn, vb);
  fs.writeFileSync(full, out, "utf8");
  console.log(`${relPath} → viewBox="${vb}" (${widthIn}"×${heightIn}")`);
}

for (const { file, widthIn, heightIn } of JOBS) {
  processFile(file, widthIn, heightIn);
}
