/**
 * Build full-rectangle bleed parents from product mockup photos.
 *
 * The mockups show the badge lying on a light page, so every crop of one is
 * ringed by page colour plus a soft drop-shadow ramp. That ring must never
 * reach the parent: it lands on or inside the trim line and prints as a white
 * outline around the badge. So we locate the badge's painted edge, scale the
 * artwork to cover the full bleed rectangle, and trim page AA so it never
 * prints as a white outline.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  processParent,
  sizesForTemplate,
} from "../cut-die-from-rect-parent.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SOURCE_DIR = join(root, "app/temp/Color Custom Badges");
export const OUT_DIR = join(SOURCE_DIR, "plan2-rect-parents");
export const PUBLIC_DIR = join(root, "public/badge-custom-backgrounds");

/** Page colour is uniform; anything past this delta is shadow or artwork. */
const PAGE_DELTA = 5;
/** Extra pixels trimmed past the detected painted edge, for anti-aliasing. */
const EDGE_SAFETY = 7;
/** Used when a side has too little contrast to find its painted edge. */
const FALLBACK_RAMP = 14;
/** Real artwork must reach at least this far past the die on the short axis. */
const DIE_COVER_MARGIN = 6;

function readerFor(data, width, height) {
  return (x, y) => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    const i = (cy * width + cx) * 3;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Walk inward from the page and return the offset of the first painted pixel.
 * The page + shadow ramp darkens monotonically; the painted edge is where that
 * stops, either because the profile turns back up or because it drops sharply.
 */
function rampDepth(luma, originX, originY, stepX, stepY, maxSteps = 34) {
  const page = luma(originX, originY);
  let previous = page;
  for (let step = 1; step <= maxSteps; step++) {
    const value = luma(originX + stepX * step, originY + stepY * step);
    if (value > previous + 2 || value < previous - 8) return step;
    previous = value;
    if (step > 20 && Math.abs(value - page) < PAGE_DELTA) return null;
  }
  return null;
}

function fitCircle(points) {
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    sx3 = 0,
    sy3 = 0,
    sx2y = 0,
    sxy2 = 0;
  for (const [x, y] of points) {
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sx3 += x * x * x;
    sy3 += y * y * y;
    sx2y += x * x * y;
    sxy2 += x * y * y;
  }
  if (n < 12) return null;
  const m = [
    [sxx, sxy, sx, -(sx3 + sxy2)],
    [sxy, syy, sy, -(sx2y + sy3)],
    [sx, sy, n, -(sxx + syy)],
  ];
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    }
    [m[i], m[pivot]] = [m[pivot], m[i]];
    if (Math.abs(m[i][i]) < 1e-9) return null;
    const d = m[i][i];
    for (let c = i; c < 4; c++) m[i][c] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = m[r][i];
      for (let c = i; c < 4; c++) m[r][c] -= f * m[i][c];
    }
  }
  const cx = -m[0][3] / 2;
  const cy = -m[1][3] / 2;
  const inner = cx * cx + cy * cy - m[2][3];
  if (inner <= 0) return null;
  return { cx, cy, radius: Math.sqrt(inner) };
}

/**
 * Locate the badge's painted rounded rect inside a mockup crop, in source px.
 */
export function findPaintedBadge(data, width, height, crop) {
  const luma = readerFor(data, width, height);
  const outside = 12;
  const spanX = () => {
    const xs = [];
    for (let i = 1; i < 32; i++) {
      xs.push(crop.left + Math.round((crop.width * i) / 32));
    }
    return xs.filter((x) => x > crop.left + 150 && x < crop.left + crop.width - 150);
  };
  const spanY = () => {
    const ys = [];
    for (let i = 1; i < 32; i++) {
      ys.push(crop.top + Math.round((crop.height * i) / 32));
    }
    return ys.filter((y) => y > crop.top + 130 && y < crop.top + crop.height - 130);
  };

  const depths = (samples, ox, oy, sx, sy) => {
    const found = [];
    for (const s of samples) {
      const d = rampDepth(luma, sx === 0 ? s : ox, sy === 0 ? s : oy, sx, sy);
      if (d != null) found.push(d);
    }
    return found.length >= 5 ? median(found) : FALLBACK_RAMP + outside;
  };

  const left = depths(spanY(), crop.left - outside, 0, 1, 0) - outside;
  const right =
    depths(spanY(), crop.left + crop.width - 1 + outside, 0, -1, 0) - outside;
  const top = depths(spanX(), 0, crop.top - outside, 0, 1) - outside;
  const bottom =
    depths(spanX(), 0, crop.top + crop.height - 1 + outside, 0, -1) - outside;

  const insets = {
    left: Math.max(0, left) + EDGE_SAFETY,
    right: Math.max(0, right) + EDGE_SAFETY,
    top: Math.max(0, top) + EDGE_SAFETY,
    bottom: Math.max(0, bottom) + EDGE_SAFETY,
  };

  // Corner radius from where the page first darkens, minus the ramp we skipped.
  const page = luma(crop.left - outside, crop.top - outside);
  const arcPoints = [];
  for (let dy = 2; dy < 150; dy++) {
    const y = crop.top + dy;
    for (let dx = -outside; dx < 220; dx++) {
      if (Math.abs(luma(crop.left + dx, y) - page) > PAGE_DELTA) {
        if (dx > 1 && dx < 150) arcPoints.push([dx, dy]);
        break;
      }
    }
  }
  const fitted = fitCircle(arcPoints);
  const rampAverage = (insets.left + insets.top) / 2;
  const radius = Math.max(
    40,
    Math.round((fitted?.radius ?? 120) - rampAverage),
  );

  return {
    rect: {
      left: crop.left + Math.round(insets.left),
      top: crop.top + Math.round(insets.top),
      width: crop.width - Math.round(insets.left + insets.right),
      height: crop.height - Math.round(insets.top + insets.bottom),
    },
    radius,
    insets,
    outerRadius: fitted?.radius ?? null,
  };
}

/** Signed distance to a rounded rect spanning [0,w-1]×[0,h-1]; <0 is inside. */
export function signedDistanceRoundedRect(x, y, w, h, r) {
  const hx = (w - 1) / 2;
  const hy = (h - 1) / 2;
  const qx = Math.abs(x - hx) - (hx - r);
  const qy = Math.abs(y - hy) - (hy - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

/**
 * Replace isolated warm/bright fringe rows (die AA) near the top/bottom of
 * the bleed with the average of the rows above and below.
 */
function healBrightRimRows(buf, W, H) {
  const candidates = new Set();
  for (let y = 0; y < 12; y++) {
    candidates.add(y);
    candidates.add(H - 1 - y);
  }
  for (const y of candidates) {
    if (y < 1 || y >= H - 1) continue;
    let bright = 0;
    let n = 0;
    for (let x = Math.floor(W * 0.08); x < Math.floor(W * 0.92); x++) {
      const i = (y * W + x) * 3;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const L = (r + g + b) / 3;
      n++;
      if (L > 195 && r > b + 10) bright++;
    }
    if (bright < n * 0.35) continue;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const above = ((y - 1) * W + x) * 3;
      const below = ((y + 1) * W + x) * 3;
      buf[i] = Math.round((buf[above] + buf[below]) / 2);
      buf[i + 1] = Math.round((buf[above + 1] + buf[below + 1]) / 2);
      buf[i + 2] = Math.round((buf[above + 2] + buf[below + 2]) / 2);
    }
  }
}

/** Replace a darker 1px hairline on the outer edge with the next interior row. */
function healEdgeHairline(buf, W, H) {
  for (const y of [0, H - 1]) {
    const yIn = y === 0 ? 1 : H - 2;
    let deltaSum = 0;
    let n = 0;
    for (let x = Math.floor(W * 0.1); x < Math.floor(W * 0.9); x++) {
      const i = (y * W + x) * 3;
      const j = (yIn * W + x) * 3;
      const L0 = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
      const L1 = (buf[j] + buf[j + 1] + buf[j + 2]) / 3;
      deltaSum += L1 - L0;
      n++;
    }
    if (n < 1 || deltaSum / n < 4) continue;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const j = (yIn * W + x) * 3;
      buf[i] = buf[j];
      buf[i + 1] = buf[j + 1];
      buf[i + 2] = buf[j + 2];
    }
  }
}

/**
 * Die-edge AA often leaves 1–3 pale rows at the top/bottom of the extract.
 * Replace any band brighter than its interior neighbour with that neighbour.
 */
function healPaleEdgeBands(buf, W, H, maxDepth = 5) {
  for (const fromTop of [true, false]) {
    for (let depth = 0; depth < maxDepth; depth++) {
      const y = fromTop ? depth : H - 1 - depth;
      const yRef = fromTop
        ? Math.min(H - 1, depth + 4)
        : Math.max(0, H - 1 - depth - 4);
      if (y === yRef) continue;
      let sumY = 0;
      let sumRef = 0;
      let n = 0;
      for (let x = Math.floor(W * 0.1); x < Math.floor(W * 0.9); x++) {
        const i = (y * W + x) * 3;
        const j = (yRef * W + x) * 3;
        sumY += (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
        sumRef += (buf[j] + buf[j + 1] + buf[j + 2]) / 3;
        n++;
      }
      if (n < 1 || sumY / n < sumRef / n + 10) continue;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const j = (yRef * W + x) * 3;
        buf[i] = buf[j];
        buf[i + 1] = buf[j + 1];
        buf[i + 2] = buf[j + 2];
      }
    }
  }
}

/**
 * Fill AABB corner crescents that are still page-white. Real artwork near the
 * die arc (including soft sand/sky) is left alone so we don't leave a curved seam.
 */
function cleanRoundedRectCrescents(buf, w, h, radius) {
  const r = Math.max(
    1,
    Math.min(Math.round(radius), Math.floor(Math.min(w, h) / 2) - 1),
  );
  const margin = Math.min(r, Math.max(18, Math.round(r * 0.35)));
  const src = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Include a couple px of AA just inside the arc.
      if (signedDistanceRoundedRect(x, y, w, h, r) < -2) continue;
      const di = (y * w + x) * 3;
      const rC = src[di];
      const gC = src[di + 1];
      const bC = src[di + 2];
      const L = (rC + gC + bC) / 3;
      const chroma = Math.max(rC, gC, bC) - Math.min(rC, gC, bC);
      // Page / soft AA: bright and low-chroma (not blue sky, not warm sand grain).
      // Sky is chromatic blue; page is near-neutral.
      if (L < 200 || chroma > 28) continue;
      if (bC > rC + 15 && bC > gC + 5) continue; // sky
      const sx = Math.max(margin, Math.min(w - 1 - margin, x));
      const sy = Math.max(margin, Math.min(h - 1 - margin, y));
      const si = (sy * w + sx) * 3;
      buf[di] = src[si];
      buf[di + 1] = src[si + 1];
      buf[di + 2] = src[si + 2];
    }
  }
}

/**
 * Build a bleed-sized parent whose every pixel is badge artwork.
 * Cleans page crescents from the painted AABB, then scales to cover the full
 * bleed rectangle (no mirrored overhang). Returns the PNG plus a geometry
 * report for the trim.
 */
export async function buildParentFromMockup({ sourcePath, crop, templateId }) {
  const sizes = sizesForTemplate(templateId);
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const badge = findPaintedBadge(data, info.width, info.height, crop);

  // A badge photographed flat matches its die aspect. When a low-contrast side
  // defeats the edge finder it falls back to a fixed inset, which eats real art
  // and leaves the face too short to cover the die — so restore the aspect by
  // growing the short axis back, never past the crop we were given.
  const dieAspect = sizes.dieWIn / sizes.dieHIn;
  const wantHeight = Math.round(badge.rect.width / dieAspect);
  if (wantHeight > badge.rect.height) {
    const grow = wantHeight - badge.rect.height;
    const up = Math.min(
      Math.ceil(grow / 2),
      Math.max(0, badge.rect.top - crop.top),
    );
    const down = Math.min(
      grow - up,
      Math.max(0, crop.top + crop.height - (badge.rect.top + badge.rect.height)),
    );
    badge.rect.top -= up;
    badge.rect.height += up + down;
  }

  const extracted = await sharp(sourcePath)
    .extract(badge.rect)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  cleanRoundedRectCrescents(
    extracted.data,
    extracted.info.width,
    extracted.info.height,
    badge.radius,
  );

  // Cover the full bleed so every pixel is real artwork — no corner extend.
  const scale = Math.max(
    sizes.bleedW / badge.rect.width,
    sizes.bleedH / badge.rect.height,
    (sizes.dieH + DIE_COVER_MARGIN * 2) / badge.rect.height,
  );
  const faceW = Math.round(badge.rect.width * scale);
  const faceH = Math.round(badge.rect.height * scale);
  const offsetX = Math.round((sizes.bleedW - faceW) / 2);
  const offsetY = Math.round((sizes.bleedH - faceH) / 2);

  const face = (
    await sharp(extracted.data, {
      raw: {
        width: extracted.info.width,
        height: extracted.info.height,
        channels: 3,
      },
    })
      .resize(faceW, faceH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  ).data;

  const parent = Buffer.alloc(sizes.bleedW * sizes.bleedH * 3);
  for (let py = 0; py < sizes.bleedH; py++) {
    for (let px = 0; px < sizes.bleedW; px++) {
      const fx = Math.max(0, Math.min(faceW - 1, px - offsetX));
      const fy = Math.max(0, Math.min(faceH - 1, py - offsetY));
      const si = (fy * faceW + fx) * 3;
      const di = (py * sizes.bleedW + px) * 3;
      parent[di] = face[si];
      parent[di + 1] = face[si + 1];
      parent[di + 2] = face[si + 2];
    }
  }

  healBrightRimRows(parent, sizes.bleedW, sizes.bleedH);
  healEdgeHairline(parent, sizes.bleedW, sizes.bleedH);
  healPaleEdgeBands(parent, sizes.bleedW, sizes.bleedH);

  // Clearance is the pad (face covers the bleed).
  let clearance = Infinity;
  for (let dieY = 0; dieY < sizes.dieH; dieY++) {
    for (let dieX = 0; dieX < sizes.dieW; dieX++) {
      const inDie =
        signedDistanceRoundedRect(
          dieX,
          dieY,
          sizes.dieW,
          sizes.dieH,
          sizes.radiusPx,
        ) < 0;
      if (!inDie) continue;
      const bx = dieX + sizes.pad;
      const by = dieY + sizes.pad;
      clearance = Math.min(bx, by, sizes.bleedW - 1 - bx, sizes.bleedH - 1 - by);
    }
  }

  const parentPng = await sharp(parent, {
    raw: { width: sizes.bleedW, height: sizes.bleedH, channels: 3 },
  })
    .png()
    .toBuffer();

  return {
    parentPng,
    report: {
      insets: badge.insets,
      paintedRect: badge.rect,
      paintedRadius: badge.radius,
      scale: Number(scale.toFixed(4)),
      faceW,
      faceH,
      offsetX,
      offsetY,
      extendedShare: 0,
      trimClearancePx: Number(clearance.toFixed(1)),
    },
  };
}

/**
 * Build, verify and install the print bleed for a list of mockup-based badges.
 * Refuses to install anything whose painted edge reaches the trim line, since
 * that is what puts a white outline on the printed badge.
 */
export async function runBleedJobs(jobs) {
  mkdirSync(join(OUT_DIR, "parents"), { recursive: true });
  for (const job of jobs) {
    // `sourcePath` is for mockups already published under public/; `sourceName`
    // is for originals in the working folder, which also get published.
    const sourcePath = job.sourcePath ?? join(SOURCE_DIR, job.sourceName);
    const built = await buildParentFromMockup({
      sourcePath,
      crop: job.crop,
      templateId: job.templateId,
    });
    const { report } = built;
    const parentPng = job.postprocessParent
      ? await job.postprocessParent(built.parentPng, {
          report,
          templateId: job.templateId,
        })
      : built.parentPng;
    if (report.trimClearancePx < 2) {
      throw new Error(
        `${job.stem}: painted edge only clears the trim by ${report.trimClearancePx}px`,
      );
    }

    const parentPath = join(OUT_DIR, "parents", `${job.stem}-parent.png`);
    writeFileSync(parentPath, parentPng);
    await processParent({
      parentPath,
      templateId: job.templateId,
      stem: job.stem,
      outDir: OUT_DIR,
      coverPosition: "centre",
    });
    writeFileSync(
      join(PUBLIC_DIR, `${job.stem}-bleed.png`),
      readFileSync(join(OUT_DIR, "print-bleed", `${job.stem}-bleed.png`)),
    );
    if (job.sourceName) {
      writeFileSync(join(PUBLIC_DIR, job.sourceName), readFileSync(sourcePath));
    }
    console.log(`✓ ${job.stem}`, JSON.stringify(report));
  }
}
