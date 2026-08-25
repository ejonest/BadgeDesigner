/**
 * Reports the backdrop colour baked into each homepage image.
 *
 * The category/bestseller frames are cream, so a photo shot on pure white
 * reads as a hard white block inside the frame. This samples the corners of
 * each image to show which photos blend and which clash.
 *
 * Usage: node scripts/gf-audit-image-backgrounds.mjs <url|file> [...]
 */

import sharp from "sharp";

const FRAME = { r: 0xf7, g: 0xf4, b: 0xef }; // --gf-cream

const hex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${res.status} ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFileSync } = await import("node:fs");
  return readFileSync(src);
}

/** Average colour of a square patch at each corner, then the mean of those. */
async function cornerColour(buf) {
  const img = sharp(buf).flatten({ background: "#ffffff" });
  const { width, height } = await img.metadata();
  const patch = Math.max(4, Math.round(Math.min(width, height) * 0.04));

  const corners = [
    { left: 0, top: 0 },
    { left: width - patch, top: 0 },
    { left: 0, top: height - patch },
    { left: width - patch, top: height - patch },
  ];

  const samples = [];
  for (const { left, top } of corners) {
    const { data, info } = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .extract({ left, top, width: patch, height: patch })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0;
    let g = 0;
    let b = 0;
    const px = data.length / info.channels;
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    samples.push({ r: r / px, g: g / px, b: b / px });
  }

  const mean = samples.reduce(
    (a, c) => ({ r: a.r + c.r / 4, g: a.g + c.g / 4, b: a.b + c.b / 4 }),
    { r: 0, g: 0, b: 0 },
  );
  return { mean, samples, width, height };
}

const rows = [];
for (const src of process.argv.slice(2)) {
  try {
    const { mean, width, height } = await cornerColour(await load(src));
    const delta = Math.round(
      Math.abs(mean.r - FRAME.r) + Math.abs(mean.g - FRAME.g) + Math.abs(mean.b - FRAME.b),
    );
    const warmth = Math.round(mean.r - mean.b); // >0 means warm/cream, ~0 means neutral
    rows.push({
      name: src.split("/").pop().split("?")[0].slice(0, 44),
      size: `${width}x${height}`,
      bg: hex(mean),
      delta,
      warmth,
      verdict: delta <= 10 ? "blends" : delta <= 20 ? "close" : "CLASHES",
    });
  } catch (err) {
    rows.push({ name: src.slice(-44), size: "-", bg: "-", delta: "-", warmth: "-", verdict: err.message });
  }
}

console.log(`frame colour: ${hex(FRAME)} (--gf-cream)\n`);
console.log(
  ["image".padEnd(46), "size".padEnd(11), "corner".padEnd(9), "Δ".padEnd(5), "warm".padEnd(6), "verdict"].join(""),
);
for (const r of rows) {
  console.log(
    [
      r.name.padEnd(46),
      String(r.size).padEnd(11),
      String(r.bg).padEnd(9),
      String(r.delta).padEnd(5),
      String(r.warmth).padEnd(6),
      r.verdict,
    ].join(""),
  );
}
