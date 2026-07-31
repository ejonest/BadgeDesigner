/**
 * Build full-rectangle bleed parents from product mockup photos.
 *
 * The mockups show the badge lying on a light page, so every crop of one is
 * ringed by page colour plus a soft drop-shadow ramp. That ring must never
 * reach the parent: it lands on or inside the trim line and prints as a white
 * outline around the badge. So we locate the badge's painted edge, scale the
 * artwork inside it to fill the bleed width, and fill whatever is left over
 * (bleed corners and the top/bottom strips) by mirroring artwork back across
 * the painted edge.
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
const EDGE_SAFETY = 2;
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

/** Reflect a bleed pixel across the closest painted rounded-rect edge. */
function mirrorInside(x, y, w, h, r) {
  if (x >= r && x <= w - 1 - r) {
    return [x, y < 0 ? -y : 2 * (h - 1) - y];
  }
  if (y >= r && y <= h - 1 - r) {
    return [x < 0 ? -x : 2 * (w - 1) - x, y];
  }
  const cx = x < r ? r : w - 1 - r;
  const cy = y < r ? r : h - 1 - r;
  const vx = x - cx;
  const vy = y - cy;
  const distance = Math.hypot(vx, vy) || 1;
  const mirrored = Math.max(1, 2 * r - distance);
  return [cx + (vx / distance) * mirrored, cy + (vy / distance) * mirrored];
}

function sampleBilinear(data, width, height, x, y) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top =
      data[(y0 * width + x0) * 3 + c] * (1 - fx) +
      data[(y0 * width + x1) * 3 + c] * fx;
    const bottom =
      data[(y1 * width + x0) * 3 + c] * (1 - fx) +
      data[(y1 * width + x1) * 3 + c] * fx;
    out[c] = Math.round(top * (1 - fy) + bottom * fy);
  }
  return out;
}

/**
 * Build a bleed-sized parent whose every pixel is badge artwork.
 * Returns the PNG plus the geometry report used to verify the trim area.
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

  // Scale to the bleed width, which is what puts real art past the left and
  // right trim. The bleed rectangle is a squarer aspect than the die, so the
  // face never fills it vertically and the leftover strips are extended art —
  // fine, as long as the face still covers the die itself with a margin.
  const scale = Math.max(
    sizes.bleedW / badge.rect.width,
    (sizes.dieH + DIE_COVER_MARGIN * 2) / badge.rect.height,
  );
  const faceW = Math.round(badge.rect.width * scale);
  const faceH = Math.round(badge.rect.height * scale);
  const faceRadius = badge.radius * scale;
  const offsetX = Math.round((sizes.bleedW - faceW) / 2);
  const offsetY = Math.round((sizes.bleedH - faceH) / 2);

  const face = (
    await sharp(sourcePath)
      .extract(badge.rect)
      .resize(faceW, faceH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  ).data;

  const parent = Buffer.alloc(sizes.bleedW * sizes.bleedH * 3);
  let mirrored = 0;
  for (let py = 0; py < sizes.bleedH; py++) {
    for (let px = 0; px < sizes.bleedW; px++) {
      const fx = px - offsetX;
      const fy = py - offsetY;
      let colour;
      if (signedDistanceRoundedRect(fx, fy, faceW, faceH, faceRadius) < 0) {
        const i = (fy * faceW + fx) * 3;
        colour = [face[i], face[i + 1], face[i + 2]];
      } else {
        const [sx, sy] = mirrorInside(fx, fy, faceW, faceH, faceRadius);
        colour = sampleBilinear(face, faceW, faceH, sx, sy);
        mirrored++;
      }
      const index = (py * sizes.bleedW + px) * 3;
      parent[index] = colour[0];
      parent[index + 1] = colour[1];
      parent[index + 2] = colour[2];
    }
  }

  // The trim area must be real artwork end to end: measure how far the painted
  // edge clears the die outline at its tightest point.
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
      clearance = Math.min(
        clearance,
        -signedDistanceRoundedRect(
          dieX + sizes.pad - offsetX,
          dieY + sizes.pad - offsetY,
          faceW,
          faceH,
          faceRadius,
        ),
      );
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
      mirroredShare: Number(
        (mirrored / (sizes.bleedW * sizes.bleedH)).toFixed(4),
      ),
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
