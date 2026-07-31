/**
 * Build print-bleed PNGs for custom badge backgrounds.
 *
 * Deterministic pass (this script):
 * 1. Extract calibrated badge-face crop from the mockup.
 * 2. Sample plate color from the face center.
 * 3. Mask page-white exterior around the rounded die.
 * 4. Strip the thin neutral die outline / halo (keep warm cream motifs).
 * 5. Sharp rect = face + 0.05″ pad filled with plate; paste cleaned face.
 *    The rounded-die interior stays pixel-identical to the cleaned face.
 *
 * Edge-motif outpaint (beans, etc.): do NOT whole-image redraw or Telea-smear
 * here — that destroys the interior or looks wiped. For badges whose art
 * touches the die edge:
 *   a) Build an L-shaped corner canvas (face content + empty plate margin)
 *   b) Generatively continue only into that margin
 *   c) Composite with scripts/composite-bleed-outpaint.py so only the pad /
 *      exterior crescents change (face interior stays byte-identical)
 * Optional tip clone: BLEED_EXTEND_TIPS=1 (usually looks worse on line-art).
 *
 * Writes to public/badge-custom-backgrounds/ and
 * app/temp/Color Custom Badges/bleed-outpaint-qa/
 *
 * Usage: node scripts/generate-custom-background-bleeds.mjs
 *        node scripts/generate-custom-background-bleeds.mjs chill
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const configPath = join(
  root,
  "app/data/badge-custom-backgrounds.local.json",
);
const publicDir = join(root, "public/badge-custom-backgrounds");
const qaDir = join(
  root,
  "app/temp/Color Custom Badges/bleed-outpaint-qa",
);

/** Must match PRINT_BLEED_IN_PER_SIDE in app/utils/renderSvg.ts */
const BLEED_IN_PER_SIDE = 0.05;
const DIE_WIDTH_IN = 3;
const DIE_HEIGHT_IN_BY_TEMPLATE = {
  "rect-1x3": 1,
  "rect-1_5x3": 1.5,
  "square-1x3": 1,
  "square-1_5x3": 1.5,
};

const PAGE_WHITE_DIST = 18;
const MIN_DIST_FROM_PLATE = 28;
/** Non-plate threshold relative to plate fill. */
const ART_DIST = 32;
/** How far inside the die edge the protected “exact face” starts. */
const PROTECT_INSET = 8;
/** Die-outline band width (px) along the rounded perimeter. */
const OUTLINE_BAND = 3;
/** How far edge art may grow into the bleed pad. */
const EDGE_EXTEND_PX = 24;
/** Only motif tips this close to the die edge seed outpaint. */
const EDGE_SEED_BAND = 4;
/** Max ΔE-ish distance to sampled outline color to count as die stroke. */
const OUTLINE_COLOR_DIST = 28;

function previewToBleedFileName(fileName) {
  const base = fileName
    .replace(/-Badge-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/-main-preview\.(jpe?g|png|webp)$/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "");
  return `${base}-bleed.png`;
}

function denorm(norm, canvasW, canvasH) {
  return {
    x: Math.round(norm.xNorm * canvasW),
    y: Math.round(norm.yNorm * canvasH),
    width: Math.round(norm.widthNorm * canvasW),
    height: Math.round(norm.heightNorm * canvasH),
  };
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCenterPlate(rgba, w, h) {
  const rs = [];
  const gs = [];
  const bs = [];
  const x0 = Math.floor(w * 0.3);
  const x1 = Math.floor(w * 0.7);
  const y0 = Math.floor(h * 0.3);
  const y1 = Math.floor(h * 0.7);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const pi = (y * w + x) * 4;
      rs.push(rgba[pi]);
      gs.push(rgba[pi + 1]);
      bs.push(rgba[pi + 2]);
    }
  }
  const mid = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [mid(rs), mid(gs), mid(bs)];
}

function isPageWhite(r, g, b, plate) {
  const nearWhite = colorDist(r, g, b, 255, 255, 255) <= PAGE_WHITE_DIST;
  if (!nearWhite) return false;
  return colorDist(r, g, b, plate[0], plate[1], plate[2]) >= MIN_DIST_FROM_PLATE;
}

function isArt(r, g, b, plate) {
  return colorDist(r, g, b, plate[0], plate[1], plate[2]) >= ART_DIST;
}

function floodPageExterior(rgba, w, h, plate) {
  const exterior = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const seeds = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];
  const queue = [];
  for (const [sx, sy] of seeds) {
    const si = (sy * w + sx) * 4;
    if (isPageWhite(rgba[si], rgba[si + 1], rgba[si + 2], plate)) {
      queue.push([sx, sy]);
    }
  }
  let qi = 0;
  while (qi < queue.length) {
    const [x, y] = queue[qi++];
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const pi = idx * 4;
    if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate)) continue;
    exterior[idx] = 1;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return exterior;
}

function insideRoundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (x >= r && x < w - r) return true;
  if (y >= r && y < h - r) return true;
  const cx = x < r ? r : w - 1 - r;
  const cy = y < r ? r : h - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Discrete distance to outside of rounded rect (0 = outside / on edge). */
function boundaryDistMap(w, h, r) {
  const dist = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!insideRoundRect(x, y, w, h, r)) {
        dist[y * w + x] = 0;
        continue;
      }
      let d = 9;
      for (let t = 1; t <= 8; t++) {
        let hit = false;
        for (let dy = -t; dy <= t && !hit; dy++) {
          for (let dx = -t; dx <= t; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== t) continue;
            if (!insideRoundRect(x + dx, y + dy, w, h, r)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          d = t;
          break;
        }
      }
      dist[y * w + x] = d;
    }
  }
  return dist;
}

function estimateCornerRadius(rgba, w, h, plate) {
  const insetFromLeft = (y) => {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate)) return x;
    }
    return 0;
  };
  const insetFromRight = (y) => {
    for (let x = w - 1; x >= 0; x--) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate))
        return w - 1 - x;
    }
    return 0;
  };
  const insetFromTop = (x) => {
    for (let y = 0; y < h; y++) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate)) return y;
    }
    return 0;
  };
  const insetFromBottom = (x) => {
    for (let y = h - 1; y >= 0; y--) {
      const pi = (y * w + x) * 4;
      if (!isPageWhite(rgba[pi], rgba[pi + 1], rgba[pi + 2], plate))
        return h - 1 - y;
    }
    return 0;
  };

  const samples = [
    insetFromLeft(0),
    insetFromLeft(1),
    insetFromRight(0),
    insetFromRight(1),
    insetFromLeft(h - 1),
    insetFromRight(h - 1),
    insetFromTop(0),
    insetFromTop(1),
    insetFromBottom(0),
    insetFromBottom(w - 1),
  ].filter((v) => v > 0 && v < Math.min(w, h) * 0.55);

  if (samples.length < 2) {
    return Math.round(Math.min(w, h) * 0.12);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

/** Sample typical die-outline color from perimeter midpoints. */
function sampleOutlineColor(rgba, w, h, plate, bdist) {
  const rs = [];
  const gs = [];
  const bs = [];
  const pushIf = (x, y) => {
    const idx = y * w + x;
    if (bdist[idx] === 0 || bdist[idx] > OUTLINE_BAND) return;
    const pi = idx * 4;
    const r = rgba[pi];
    const g = rgba[pi + 1];
    const b = rgba[pi + 2];
    if (!isArt(r, g, b, plate)) return;
    // Prefer bright stroke samples (die outlines are light)
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < 160) return;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  };
  const mx = Math.floor(w / 2);
  const my = Math.floor(h / 2);
  for (let t = 0; t < Math.max(w, h); t++) {
    if (t < w) {
      pushIf(t, 0);
      pushIf(t, 1);
      pushIf(t, h - 1);
      pushIf(t, h - 2);
    }
    if (t < h) {
      pushIf(0, t);
      pushIf(1, t);
      pushIf(w - 1, t);
      pushIf(w - 2, t);
    }
  }
  // Bias mid-edge samples
  for (let i = 0; i < 6; i++) {
    pushIf(mx, i);
    pushIf(mx, h - 1 - i);
    pushIf(i, my);
    pushIf(w - 1 - i, my);
  }
  if (rs.length < 20) return [235, 235, 235];
  const mid = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [mid(rs), mid(gs), mid(bs)];
}

/**
 * Remove thin die outline along the rounded perimeter.
 * Keeps motifs that continue inward past PROTECT_INSET (cup, beans body).
 */
function stripDieOutline(rgba, w, h, plate, exterior, bdist) {
  const outline = sampleOutlineColor(rgba, w, h, plate, bdist);
  const out = Buffer.from(rgba);
  let removed = 0;

  // Seed “real art”: non-plate pixels deep inside the die
  const keep = new Uint8Array(w * h);
  const queue = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (exterior[idx] || bdist[idx] < PROTECT_INSET) continue;
      const pi = idx * 4;
      if (!isArt(out[pi], out[pi + 1], out[pi + 2], plate)) continue;
      keep[idx] = 1;
      queue.push(idx);
    }
  }
  // Grow keep through adjacent art, but do not travel along the outline band
  // using outline-colored pixels (prevents outline ring from swallowing keep).
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx % w;
    const y = (idx / w) | 0;
    const nbs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nidx = ny * w + nx;
      if (keep[nidx] || exterior[nidx]) continue;
      const pi = nidx * 4;
      if (!isArt(out[pi], out[pi + 1], out[pi + 2], plate)) continue;
      const dOutline = colorDist(
        out[pi],
        out[pi + 1],
        out[pi + 2],
        outline[0],
        outline[1],
        outline[2],
      );
      const nearOutline =
        bdist[nidx] > 0 &&
        bdist[nidx] <= OUTLINE_BAND &&
        dOutline <= OUTLINE_COLOR_DIST;
      if (nearOutline) continue; // don't flood through the die stroke
      keep[nidx] = 1;
      queue.push(nidx);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (exterior[idx]) continue;
      if (keep[idx]) continue;
      const bd = bdist[idx];
      if (bd === 0 || bd > OUTLINE_BAND + 1) continue;
      const pi = idx * 4;
      if (!isArt(out[pi], out[pi + 1], out[pi + 2], plate)) continue;
      const r = out[pi];
      const g = out[pi + 1];
      const b = out[pi + 2];
      const nearOutlineCol =
        colorDist(r, g, b, outline[0], outline[1], outline[2]) <=
        OUTLINE_COLOR_DIST;
      // Soft mockup halo: lighter-than-plate neutrals on the perimeter that
      // were not claimed as inward motif art.
      const lift =
        0.2126 * r + 0.7152 * g + 0.0722 * b -
        (0.2126 * plate[0] + 0.7152 * plate[1] + 0.0722 * plate[2]);
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      // Cream motifs are warm (R>B); die outlines/halos are neutral gray.
      const warmCream = r - b >= 10;
      const halo = lift >= 18 && sat <= 0.18 && !warmCream;
      if (!nearOutlineCol && !halo) continue;
      out[pi] = plate[0];
      out[pi + 1] = plate[1];
      out[pi + 2] = plate[2];
      out[pi + 3] = 255;
      removed += 1;
    }
  }

  // Force-strip any remaining neutral die stroke / halo on the perimeter,
  // even if flood-fill incorrectly marked it keep. Warm cream motifs stay.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (exterior[idx]) continue;
      const bd = bdist[idx];
      if (bd === 0 || bd > OUTLINE_BAND + 3) continue;
      const pi = idx * 4;
      const r = out[pi];
      const g = out[pi + 1];
      const b = out[pi + 2];
      if (!isArt(r, g, b, plate)) continue;
      const channelSpread = Math.max(
        Math.abs(r - g),
        Math.abs(g - b),
        Math.abs(r - b),
      );
      // True cream motifs are warmer/spread; die strokes are near-neutral.
      if (channelSpread >= 14 || r - b >= 16) continue;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const plateL =
        0.2126 * plate[0] + 0.7152 * plate[1] + 0.0722 * plate[2];
      if (L - plateL < 16) continue;
      out[pi] = plate[0];
      out[pi + 1] = plate[1];
      out[pi + 2] = plate[2];
      out[pi + 3] = 255;
      keep[idx] = 0;
      removed += 1;
    }
  }

  // Surviving motif pixels (e.g. bean tips) are locked keep art.
  for (let i = 0; i < w * h; i++) {
    if (exterior[i]) continue;
    const pi = i * 4;
    if (isArt(out[pi], out[pi + 1], out[pi + 2], plate)) keep[i] = 1;
  }

  return { rgba: out, keep, outline, removed };
}


/**
 * Push warm cream / saturated motif tips a short distance into the bleed pad.
 * Only fills plate-colored cells near those tips (no whole-edge smear).
 */
function extendWarmMotifTips(
  outRgba,
  outW,
  outH,
  faceW,
  faceH,
  padX,
  padY,
  plate,
  keepFace,
  faceBdist,
) {
  const out = Buffer.from(outRgba);
  const isWarmArt = (r, g, b) => {
    if (!isArt(r, g, b, plate)) return false;
    // Warm cream line-art OR clearly non-neutral motif color
    if (r - b >= 8) return true;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    return sat >= 0.12;
  };

  const seeds = [];
  for (let y = padY; y < padY + faceH; y++) {
    for (let x = padX; x < padX + faceW; x++) {
      const fx = x - padX;
      const fy = y - padY;
      const fidx = fy * faceW + fx;
      if (!keepFace[fidx]) continue;
      if (faceBdist[fidx] === 0 || faceBdist[fidx] > EDGE_SEED_BAND + 2) continue;
      const pi = (y * outW + x) * 4;
      if (!isWarmArt(out[pi], out[pi + 1], out[pi + 2])) continue;
      seeds.push([x, y, out[pi], out[pi + 1], out[pi + 2]]);
    }
  }

  const maxD = Math.min(EDGE_EXTEND_PX, Math.max(padX, padY) + 6);
  const maxD2 = maxD * maxD;
  let extended = 0;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const inFace =
        x >= padX && x < padX + faceW && y >= padY && y < padY + faceH;
      let writable = !inFace;
      if (inFace) {
        const fidx = (y - padY) * faceW + (x - padX);
        // exterior crescents + cleared outline fringe only
        if (faceBdist[fidx] === 0) writable = true;
        else if (!keepFace[fidx] && faceBdist[fidx] <= OUTLINE_BAND + 2)
          writable = true;
        else writable = false;
      }
      if (!writable) continue;
      const pi = (y * outW + x) * 4;
      // Only fill plate / near-plate cells
      if (isArt(out[pi], out[pi + 1], out[pi + 2], plate)) continue;

      let best = null;
      let bestD2 = maxD2 + 1;
      for (const [sx, sy, sr, sg, sb] of seeds) {
        const dx = x - sx;
        const dy = y - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxD2 || d2 >= bestD2) continue;
        // Prefer outward from badge center
        const cx = padX + faceW / 2;
        const cy = padY + faceH / 2;
        const outDot = (x - cx) * (x - sx) + (y - cy) * (y - sy);
        if (outDot < -2) continue;
        bestD2 = d2;
        best = [sr, sg, sb];
      }
      if (!best) continue;
      out[pi] = best[0];
      out[pi + 1] = best[1];
      out[pi + 2] = best[2];
      out[pi + 3] = 255;
      extended += 1;
    }
  }

  // Re-lock deep interior to exact pre-extend face (already exact; safety)
  return { rgba: out, extended, seeds: seeds.length };
}

function maskMockupExterior(rgba, w, h) {
  const plate = sampleCenterPlate(rgba, w, h);
  const exterior = floodPageExterior(rgba, w, h, plate);
  const radius = estimateCornerRadius(rgba, w, h, plate);
  const bdist = boundaryDistMap(w, h, radius);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (insideRoundRect(x, y, w, h, radius)) continue;
      const pi = (y * w + x) * 4;
      const r = rgba[pi];
      const g = rgba[pi + 1];
      const b = rgba[pi + 2];
      if (
        isPageWhite(r, g, b, plate) ||
        colorDist(r, g, b, 255, 255, 255) <= 40
      ) {
        exterior[y * w + x] = 1;
      }
    }
  }

  return { exterior, plate, radius, bdist };
}

async function buildPlateBleed(faceRgba, faceW, faceH, padX, padY) {
  const { exterior, plate, radius, bdist } = maskMockupExterior(
    faceRgba,
    faceW,
    faceH,
  );
  const [pr, pg, pb] = plate;

  const stripped = stripDieOutline(
    faceRgba,
    faceW,
    faceH,
    plate,
    exterior,
    bdist,
  );

  const outW = faceW + padX * 2;
  const outH = faceH + padY * 2;
  const out = Buffer.alloc(outW * outH * 4);

  for (let i = 0; i < outW * outH; i++) {
    const di = i * 4;
    out[di] = pr;
    out[di + 1] = pg;
    out[di + 2] = pb;
    out[di + 3] = 255;
  }

  for (let y = 0; y < faceH; y++) {
    for (let x = 0; x < faceW; x++) {
      const idx = y * faceW + x;
      if (exterior[idx]) continue;
      const si = idx * 4;
      const di = ((y + padY) * outW + (x + padX)) * 4;
      out[di] = stripped.rgba[si];
      out[di + 1] = stripped.rgba[si + 1];
      out[di + 2] = stripped.rgba[si + 2];
      out[di + 3] = stripped.rgba[si + 3];
    }
  }

  // Motif tip cloning into the pad looks smeared on line-art; keep plate pad
  // and clipped edge art unless BLEED_EXTEND_TIPS=1.
  let rgbaOut = out;
  let edgeExtended = 0;
  let edgeSeeds = 0;
  if (process.env.BLEED_EXTEND_TIPS === "1") {
    const tipExtended = extendWarmMotifTips(
      out,
      outW,
      outH,
      faceW,
      faceH,
      padX,
      padY,
      plate,
      stripped.keep,
      bdist,
    );
    rgbaOut = tipExtended.rgba;
    edgeExtended = tipExtended.extended;
    edgeSeeds = tipExtended.seeds;
  }

  const exteriorCount = exterior.reduce((a, b) => a + b, 0);
  return {
    data: rgbaOut,
    width: outW,
    height: outH,
    plate: [pr, pg, pb],
    radius,
    exteriorPct: exteriorCount / (faceW * faceH),
    outlineRemoved: stripped.removed,
    edgeExtended,
    edgeSeeds,
  };
}

async function buildBleedForEntry(entry, canvasW, canvasH) {
  const srcPath = join(publicDir, entry.fileName);
  if (!existsSync(srcPath)) {
    throw new Error(`Missing source: ${entry.fileName}`);
  }

  const dieHIn =
    DIE_HEIGHT_IN_BY_TEMPLATE[entry.templateId] ??
    (entry.templateId.includes("1_5") || entry.templateId.includes("1.5")
      ? 1.5
      : 1);

  const faceNorm = entry.badgeFaceRectNorm ?? {
    xNorm: 0,
    yNorm: 0,
    widthNorm: 1,
    heightNorm: 1,
  };
  const face = denorm(faceNorm, canvasW, canvasH);
  const left = Math.max(0, face.x);
  const top = Math.max(0, face.y);
  const width = Math.min(face.width, canvasW - left);
  const height = Math.min(face.height, canvasH - top);

  const faceBuf = await sharp(srcPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const padX = Math.max(
    1,
    Math.round(width * (BLEED_IN_PER_SIDE / DIE_WIDTH_IN)),
  );
  const padY = Math.max(
    1,
    Math.round(height * (BLEED_IN_PER_SIDE / dieHIn)),
  );

  const built = await buildPlateBleed(
    faceBuf.data,
    faceBuf.info.width,
    faceBuf.info.height,
    padX,
    padY,
  );

  const png = await sharp(built.data, {
    raw: {
      width: built.width,
      height: built.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  const outName = previewToBleedFileName(entry.fileName);
  return {
    outName,
    png,
    padX,
    padY,
    faceW: width,
    faceH: height,
    plate: built.plate,
    radius: built.radius,
    exteriorPct: built.exteriorPct,
    outlineRemoved: built.outlineRemoved,
    edgeExtended: built.edgeExtended,
  };
}

async function main() {
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const canvasW = cfg.canvasWidthPx;
  const canvasH = cfg.canvasHeightPx;
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(qaDir, { recursive: true });

  const filter = (process.argv[2] || "").toLowerCase();
  const backgrounds = filter
    ? cfg.backgrounds.filter(
        (b) =>
          b.id.toLowerCase().includes(filter) ||
          b.fileName.toLowerCase().includes(filter),
      )
    : cfg.backgrounds;

  let ok = 0;
  let fail = 0;
  for (const entry of backgrounds) {
    try {
      const result = await buildBleedForEntry(entry, canvasW, canvasH);
      writeFileSync(join(publicDir, result.outName), result.png);
      writeFileSync(join(qaDir, result.outName), result.png);
      ok += 1;
      console.log(
        `OK ${entry.id} → ${result.outName} (pad ${result.padX}×${result.padY}, plate rgb(${result.plate.join(",")}), r=${result.radius}, outline -${result.outlineRemoved}px, edge +${result.edgeExtended}px, exterior ${(result.exteriorPct * 100).toFixed(1)}%)`,
      );
    } catch (err) {
      fail += 1;
      console.error(`FAIL ${entry.id}:`, err.message || err);
    }
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
