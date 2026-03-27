/**
 * Wrap themed Designer SVG content in translate+scale so viewBox is 0 0 5000 2000 (2×5)
 * or 0 0 7000 2800 (2.8×7), matching Designer heart / paws. Fixes preview/render quirks
 * from non-zero viewBox origins while keeping path data unchanged.
 *
 * Run: node scripts/normalize-themed-designer-viewbox.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { DOMParser, XMLSerializer } = require("xmldom");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGN_DIR = path.join(__dirname, "../public/templates/sign");

const JOBS = [
  { file: "Designer Coffee Bean 2x5.svg", tw: 5000, th: 2000, win: 5, hin: 2 },
  { file: "Designer Golf 2x5.svg", tw: 5000, th: 2000, win: 5, hin: 2 },
  { file: "Designer House 2x5.svg", tw: 5000, th: 2000, win: 5, hin: 2 },
  { file: "Designer Money 2x5.svg", tw: 5000, th: 2000, win: 5, hin: 2 },
  { file: "Designer Recycle 2x5.svg", tw: 5000, th: 2000, win: 5, hin: 2 },
  { file: "Designer Coffee Bean 2.8x7.svg", tw: 7000, th: 2800, win: 7, hin: 2.8 },
  { file: "Designer Golf 2.8x7.svg", tw: 7000, th: 2800, win: 7, hin: 2.8 },
  { file: "Designer House 2.8x7.svg", tw: 7000, th: 2800, win: 7, hin: 2.8 },
  { file: "Designer Money 2.8x7.svg", tw: 7000, th: 2800, win: 7, hin: 2.8 },
  { file: "Designer recycle 2.8x7.svg", tw: 7000, th: 2800, win: 7, hin: 2.8 },
];

function serializeChildren(svgEl) {
  const ser = new XMLSerializer();
  let out = "";
  for (let i = 0; i < svgEl.childNodes.length; i++) {
    out += ser.serializeToString(svgEl.childNodes[i]);
  }
  return out;
}

function processJob({ file, tw, th, win, hin }) {
  const full = path.join(SIGN_DIR, file);
  const raw = fs.readFileSync(full, "utf8");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") {
    console.error(`[skip] no svg root: ${file}`);
    return;
  }
  const vbStr = (svg.getAttribute("viewBox") || "").trim();
  const parts = vbStr.split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    console.error(`[skip] bad viewBox: ${file}`);
    return;
  }
  const [vx, vy, vw, vh] = parts;
  const sx = tw / vw;
  const sy = th / vh;
  if (Math.abs(sx - sy) > 0.0001) {
    console.error(`[skip] non-uniform scale ${file}: ${vw}×${vh} vs ${tw}×${th}`);
    return;
  }
  const inner = serializeChildren(svg);
  const style =
    svg.getAttribute("style") ||
    "shape-rendering:geometricPrecision; text-rendering:geometricPrecision; image-rendering:optimizeQuality; fill-rule:evenodd; clip-rule:evenodd";
  const out = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${win}in" height="${hin}in" version="1.1" style="${style}"
viewBox="0 0 ${tw} ${th}"
 xmlns:xlink="http://www.w3.org/1999/xlink"
 xmlns:xodm="http://www.corel.com/coreldraw/odm/2003">
 <g transform="translate(${-vx},${-vy}) scale(${sx})">
${inner}
 </g>
</svg>
`;
  fs.writeFileSync(full, out, "utf8");
  console.log(`${file} → viewBox 0 0 ${tw} ${th} (translate ${-vx},${-vy} scale ${sx})`);
}

for (const job of JOBS) {
  processJob(job);
}
