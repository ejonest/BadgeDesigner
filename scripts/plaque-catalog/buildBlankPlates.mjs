/**
 * Blank "Make your own" plates, cloned from the logo product photos with the
 * engraved caption and divider covered by the plate's own brushed texture.
 *
 *   node scripts/plaque-catalog/buildBlankPlates.mjs
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = path.join(root, "app/temp/Plaque Preview Images/Logo Plaques");
const outDir = path.join(root, "public/images/plaque/blank");
const box = { x0: 160, y0: 165, x1: 245, y1: 270 };
const sources = {
  gold: "brushed-gold",
  silver: "brushed-silver",
  "black-white": "black-white",
  "white-black": "white-black",
  "full-color": "full-color",
};

/** Caption band, then the divider band, on the 400px logo-plate photos. */
function coverBrushedEngraving(data, info) {
  const channels = info.channels;
  const width = info.width;
  const at = (x, y) => (y * width + x) * channels;
  const copy = Buffer.from(data);
  const bands = [
    { y0: 172, y1: 194, x0: 168, x1: 242, donor0: 146, donor1: 168 },
    { y0: 234, y1: 256, x0: 154, x1: 246, donor0: 258, donor1: 280 },
  ];
  const inBand = (y) => bands.some((band) => y >= band.y0 && y <= band.y1);
  const feather = 2;
  for (let x = 148; x <= 252; x += 1) {
    const known = [[], [], []];
    for (let y = 115; y <= 295; y += 1) {
      if (inBand(y)) continue;
      const index = at(x, y);
      for (let channel = 0; channel < 3; channel += 1) known[channel].push([y, data[index + channel]]);
    }
    const interp = (channel, y) => {
      const points = known[channel];
      let below = points[0];
      let above = points[points.length - 1];
      for (const point of points) {
        if (point[0] <= y) below = point;
        if (point[0] >= y) {
          above = point;
          break;
        }
      }
      if (below[0] === above[0]) return below[1];
      const t = (y - below[0]) / (above[0] - below[0]);
      return below[1] * (1 - t) + above[1] * t;
    };
    for (const band of bands) {
      if (x < band.x0 || x > band.x1) continue;
      const donors = [];
      for (let y = band.donor0; y <= band.donor1; y += 1) donors.push(y);
      for (let y = band.y0; y <= band.y1; y += 1) {
        const donorY = donors[(y - band.y0) % donors.length];
        const edge = Math.min(y - band.y0, band.y1 - y);
        const weight = edge >= feather ? 1 : (edge + 1) / (feather + 1);
        const src = at(x, donorY);
        const dst = at(x, y);
        for (let channel = 0; channel < 3; channel += 1) {
          const grain = data[src + channel] - interp(channel, donorY);
          const filled = Math.max(0, Math.min(255, Math.round(interp(channel, y) + grain)));
          copy[dst + channel] = Math.round(data[dst + channel] * (1 - weight) + filled * weight);
        }
      }
    }
  }
  return copy;
}

mkdirSync(outDir, { recursive: true });
for (const [plate, token] of Object.entries(sources)) {
  const file = path.join(
    sourceDir,
    `Custom-Insert-Your-Logo-Award-Plaque-wood-frame-(${token})-main-400x400-preview.jpg`,
  );
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const at = (x, y) => (y * info.width + x) * channels;
  const lumAt = (x, y) => {
    const index = at(x, y);
    return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  };
  const lightEngraving = plate === "black-white";
  const textured = plate === "gold" || plate === "silver";
  if (textured) {
    // The logo photos have a caption and a divider. Painting across those
    // marks leaves streaks, so rebuild each column from the clean metal
    // above and below and keep that column's brushed grain.
    const copy = coverBrushedEngraving(data, info);
    const destination = path.join(outDir, `wood-${plate}.jpg`);
    await sharp(copy, { raw: { width: info.width, height: info.height, channels } })
      .jpeg({ quality: 93 })
      .toFile(destination);
    console.log(path.relative(root, destination));
    continue;
  }
  const donorX = 156;
  const marks = new Set();
  for (let y = box.y0; y <= box.y1; y += 1) {
    const plateLum = lumAt(donorX, y);
    for (let x = box.x0; x <= box.x1; x += 1) {
      const lum = lumAt(x, y);
      const engraved = lightEngraving ? lum > plateLum + 24 : lum < plateLum - 60;
      if (engraved) marks.add(`${x},${y}`);
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const key of [...marks]) {
      const [x, y] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) marks.add(`${x + dx},${y + dy}`);
      }
    }
  }
  const copy = Buffer.from(data);
  for (const key of marks) {
    const [x, y] = key.split(",").map(Number);
    if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) continue;
    const src = at(donorX, y);
    const dst = at(x, y);
    copy[dst] = data[src];
    copy[dst + 1] = data[src + 1];
    copy[dst + 2] = data[src + 2];
  }
  const destination = path.join(outDir, `wood-${plate}.jpg`);
  await sharp(copy, { raw: { width: info.width, height: info.height, channels } })
    .jpeg({ quality: 90 })
    .toFile(destination);
  console.log(path.relative(root, destination));
}
