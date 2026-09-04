/**
 * Builds the step-1 option photos from the studio shots in app/temp.
 *
 * The cards render these with `mix-blend-mode: multiply` over cream, so the
 * studio white has to survive as pure white — hence flatten-to-white rather
 * than keeping alpha, and a light JPEG quality floor so compression noise
 * doesn't grey the background.
 *
 * Usage: node scripts/build-gavel-option-photos.mjs
 */
import path from "node:path";
import sharp from "sharp";

const SRC_ROOT = "app/temp/Gavels Fast - Core Products";
const OUT_DIR = "public/images/gavel";

/** Longest edge in the built file; cards are ~400 CSS px, so this covers 2x. */
const MAX_W = 900;
const MAX_H = 640;

/*
 * One canonical file per studio shot. Step 1's chooser and the preview's
 * "Actual product" tab both point into this set, so a shot is never processed
 * or stored twice under two names.
 */
const GAVELS = "Gavels & Sound Blocks (Walnut, Rubberwood, Ebony)";
const BLOCKS = "Sound Blocks (Walnut & Rubberwood)";

const JOBS = [
  // Walnut
  { src: `${GAVELS}/Walnut-Gavel-Only-Gold.png`, out: "product-walnut-gavel.jpg" },
  {
    src: `${GAVELS}/Walnut Gavel & Square Sound Block (Gold).png`,
    out: "product-walnut-block.jpg",
  },
  {
    src: `${GAVELS}/Walnit Gavel & Square Sound Block (Gold) - Side Angle.png`,
    out: "product-walnut-block-angle.jpg",
  },
  {
    src: `${GAVELS}/Walnut-Gavel-and-Round-Sound-Block-Gold.jpg`,
    out: "product-walnut-round-block.jpg",
  },
  {
    src: `${GAVELS}/Walnut-Gavel-and-Gavel-Stand-Custom-Gold.png`,
    out: "product-walnut-stand.jpg",
  },
  {
    src: `${GAVELS}/Walnut-Gavel-and-Gavel-Stand-Custom-Silver.png`,
    out: "product-walnut-stand-silver.jpg",
  },
  {
    src: `${GAVELS}/Walnut-Gavel-and-Gavel-Stand-Custom-Gold-Front-Face.png`,
    out: "product-walnut-stand-front.jpg",
  },

  // Rubberwood
  {
    src: `${GAVELS}/Rubberwood-Gavel-Only-Gold.png`,
    out: "product-rubberwood-gavel.jpg",
  },
  {
    src: `${GAVELS}/Rubberwood-Gavel-and-Sound-Block-Gold.png`,
    out: "product-rubberwood-block.jpg",
  },
  {
    src: `${GAVELS}/Rubberwood-Gavel-and-Gavel-Stand-Custom-Gold.png`,
    out: "product-rubberwood-stand.jpg",
  },

  // Ebony (no gavel-only or stand shot exists for this wood)
  {
    src: `${GAVELS}/Ebony-Gavel-and-Sound-Block-Gold.jpg`,
    out: "product-ebony-block.jpg",
  },
  {
    src: `${GAVELS}/Ebony-Gavel-and-Sound-Block.jpg`,
    out: "product-ebony-block-silver.jpg",
  },

  // Personalized sound-block top, used by the step 1 chooser
  {
    src: `${BLOCKS}/custom-soundblock-walnut1.jpg`,
    out: "product-soundblock-engraved.jpg",
  },
];

/** Near-white and near-neutral, i.e. seamless backdrop rather than product. */
function isBackdrop(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 224 && max - min <= 20;
}

/**
 * Floods the studio backdrop to pure white, starting from the borders.
 *
 * Some of these shots are lit against light grey (as low as 237), which the
 * cards' multiply blend would render as a visible grey rectangle over the
 * cream. Flooding inward from the edge only touches the backdrop, so bright
 * highlights inside the product are never punched out the way a global
 * brightness lift or a plain threshold would do.
 */
function whitenBackdrop(data, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];

  const consider = (x, y) => {
    const p = y * width + x;
    if (seen[p]) return;
    const i = p * 3;
    if (!isBackdrop(data[i], data[i + 1], data[i + 2])) return;
    seen[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    consider(0, y);
    consider(width - 1, y);
  }

  let filled = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 3;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    filled++;

    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) consider(x - 1, y);
    if (x < width - 1) consider(x + 1, y);
    if (y > 0) consider(x, y - 1);
    if (y < height - 1) consider(x, y + 1);
  }
  return filled;
}

/** Tight bounds of everything that isn't pure-ish white, plus a small margin. */
function contentBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height };

  const pad = Math.round(0.02 * Math.max(maxX - minX, maxY - minY));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return {
    left,
    top,
    width: Math.min(width, maxX + pad + 1) - left,
    height: Math.min(height, maxY + pad + 1) - top,
  };
}

for (const job of JOBS) {
  const srcPath = path.join(SRC_ROOT, job.src);
  const outPath = path.join(OUT_DIR, job.out);

  const before = await sharp(srcPath).metadata();
  const { data, info } = await sharp(srcPath)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  whitenBackdrop(data, info.width, info.height);
  const box = contentBox(data, info.width, info.height);

  const out = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .extract(box)
    .resize({
      width: MAX_W,
      height: MAX_H,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toFile(outPath);

  console.log(
    `${job.out}: ${before.width}×${before.height} -> ${out.width}×${out.height}` +
      ` (${(out.size / 1024).toFixed(0)} kB)`,
  );
}
