/**
 * Undo normalize-themed-designer-viewbox.mjs: remove root wrapper <g> and restore
 * offset viewBox + raw coordinates (required because loadOne ignores file wrapper
 * when building inner/outline/overlay from path `d` alone).
 *
 * Run: node scripts/unwrap-normalized-designer-svg.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { DOMParser, XMLSerializer } = require("xmldom");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGN_DIR = path.join(__dirname, "../public/templates/sign");

const FILES = [
  "Designer Coffee Bean 2x5.svg",
  "Designer Golf 2x5.svg",
  "Designer House 2x5.svg",
  "Designer Money 2x5.svg",
  "Designer Recycle 2x5.svg",
  "Designer Coffee Bean 2.8x7.svg",
  "Designer Golf 2.8x7.svg",
  "Designer House 2.8x7.svg",
  "Designer Money 2.8x7.svg",
  "Designer recycle 2.8x7.svg",
];

function stripRedundantXmlns(node) {
  if (node.nodeType === 1) {
    if (node.getAttribute && node.getAttribute("xmlns") === "http://www.w3.org/2000/svg") {
      node.removeAttribute("xmlns");
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      stripRedundantXmlns(node.childNodes[i]);
    }
  }
}

/** Two decimal places; avoids 2400.0319999999997 in serialized viewBox. */
function roundViewBoxNums(vx, vy, vw, vh) {
  const r = (n) => Math.round(n * 100) / 100;
  return [r(vx), r(vy), r(vw), r(vh)];
}

function writeSvgDocument(svg, full) {
  const ser = new XMLSerializer();
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += ser.serializeToString(svg);
  if (!out.includes("<!DOCTYPE")) {
    out = out.replace(
      /<\?xml[^?]*\?>/,
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">`,
    );
  }
  fs.writeFileSync(full, out, "utf8");
}

/** If viewBox has long float tails, rewrite to 2dp (idempotent for clean values). */
function roundExistingViewBox(rel) {
  const full = path.join(SIGN_DIR, rel);
  const raw = fs.readFileSync(full, "utf8");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") return;
  const vbParts = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vbParts.length !== 4 || vbParts.some(Number.isNaN)) return;
  const [ox, oy, ow, oh] = vbParts;
  const [nx, ny, nw, nh] = roundViewBoxNums(ox, oy, ow, oh);
  if (ox === nx && oy === ny && ow === nw && oh === nh) return;
  svg.setAttribute("viewBox", `${nx} ${ny} ${nw} ${nh}`);
  stripRedundantXmlns(svg);
  writeSvgDocument(svg, full);
  console.log(`rounded viewBox ${rel} → "${nx} ${ny} ${nw} ${nh}"`);
}

const WRAPPER_TRANSFORM_RE =
  /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*scale\(\s*([-\d.eE+]+)\s*\)/;

function processFile(rel) {
  const full = path.join(SIGN_DIR, rel);
  const raw = fs.readFileSync(full, "utf8");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") return;
  // Normalized SVGs use a root wrapper g (translate+scale); Corel also adds Layer_x0020_1 g — pick g by transform pattern.
  let wrap = null;
  let m = null;
  for (let i = 0; i < svg.childNodes.length; i++) {
    const n = svg.childNodes[i];
    if (n.nodeType !== 1 || n.nodeName !== "g") continue;
    const t = n.getAttribute("transform") || "";
    const match = t.match(WRAPPER_TRANSFORM_RE);
    if (match) {
      wrap = n;
      m = match;
      break;
    }
  }
  if (!wrap || !m) {
    roundExistingViewBox(rel);
    return;
  }
  const tx = parseFloat(m[1]);
  const ty = parseFloat(m[2]);
  const s = parseFloat(m[3]);
  const vbParts = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vbParts.length !== 4 || vbParts.some(Number.isNaN)) return;
  const [, , tw, th] = vbParts;
  const vw = tw / s;
  const vh = th / s;
  const vx = -tx;
  const vy = -ty;
  const [rx, ry, rw, rh] = roundViewBoxNums(vx, vy, vw, vh);
  svg.setAttribute("viewBox", `${rx} ${ry} ${rw} ${rh}`);
  while (wrap.firstChild) {
    svg.insertBefore(wrap.firstChild, wrap);
  }
  svg.removeChild(wrap);
  stripRedundantXmlns(svg);
  writeSvgDocument(svg, full);
  console.log(`unwrapped ${rel} → viewBox="${rx} ${ry} ${rw} ${rh}"`);
}

for (const f of FILES) {
  try {
    processFile(f);
  } catch (e) {
    console.error(f, e);
  }
}
