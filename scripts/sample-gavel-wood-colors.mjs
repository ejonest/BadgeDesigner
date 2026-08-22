/**
 * Samples wood color stops out of the Gavels Fast product photos so the
 * texture recolor in build-gavel-wood-textures.mjs is measured, not guessed.
 *
 * Prints dark / mid / light linear-RGB stops per photo (5th, 50th, 90th
 * luminance percentile of the wood pixels), skipping the white sweep, the
 * metal band, and shadow.
 *
 * Usage: node scripts/sample-gavel-wood-colors.mjs
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(
  ROOT,
  "app/temp/Gavels Fast - Core Products/Gavels & Sound Blocks (Walnut, Rubberwood, Ebony)",
);

function srgbToLin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.2;
}

/** Gold/silver bands and the white sweep are not wood. */
function isWood(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 232 && max - min < 26) return false; // sweep / paper
  if (max < 8) return false; // crushed shadow
  const sat = max === 0 ? 0 : (max - min) / max;
  const isGold = r > 120 && g > 95 && b < g * 0.72 && sat > 0.3 && r > b * 1.6;
  if (isGold && max > 150) return false; // brass band
  return true;
}

async function sample(file) {
  const { data, info } = await sharp(path.join(DIR, file))
    .resize(420, 420, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = [];
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!isWood(r, g, b)) continue;
    const lum = 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
    px.push({ r, g, b, lum });
  }
  if (px.length < 500) return null;
  px.sort((a, b) => a.lum - b.lum);

  const at = (q) => {
    const lo = Math.max(0, Math.floor(px.length * (q - 0.02)));
    const hi = Math.min(px.length, Math.ceil(px.length * (q + 0.02)));
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = lo; i < hi; i++) {
      r += srgbToLin(px[i].r);
      g += srgbToLin(px[i].g);
      b += srgbToLin(px[i].b);
    }
    const n = hi - lo;
    return [r / n, g / n, b / n].map((v) => Number(v.toFixed(4)));
  };

  const hex = (lin) =>
    "#" +
    lin
      .map((v) => {
        const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.2) - 0.055;
        return Math.round(Math.max(0, Math.min(1, s)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("");

  const dark = at(0.08);
  const mid = at(0.5);
  const light = at(0.9);
  return { count: px.length, dark, mid, light, hex: [hex(dark), hex(mid), hex(light)] };
}

for (const file of readdirSync(DIR).sort()) {
  if (!/\.(png|jpg|jpeg)$/i.test(file)) continue;
  const res = await sample(file);
  if (!res) {
    console.log(`${file}: too few wood pixels`);
    continue;
  }
  console.log(`\n${file}  (${res.count} px)`);
  console.log(`  dark  ${JSON.stringify(res.dark)}  ${res.hex[0]}`);
  console.log(`  mid   ${JSON.stringify(res.mid)}  ${res.hex[1]}`);
  console.log(`  light ${JSON.stringify(res.light)}  ${res.hex[2]}`);
}
