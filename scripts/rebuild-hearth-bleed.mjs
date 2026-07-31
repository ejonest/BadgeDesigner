// Rebuilds the Nursing-Homes "Hearth" parents so the bleed is real artwork.
//
// The badge face is scaled up just enough to cover the bleed width, which pushes
// the shield and the pale panel past the trim edge using their own pixels instead
// of anything synthesised. Only the thin top/bottom strips and the trimmed corner
// wedges fall outside the badge outline. Those areas are plain lavender grid, so
// they are regenerated from the artwork's own measurements: the background colour
// gradient, the grid line spacing and phase, and the line cross-section. That
// keeps every line straight and in phase without copying pixels around.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { processParent, sizesForTemplate } from "./cut-die-from-rect-parent.mjs";

const base = join(process.cwd(), "app/temp/Color Custom Badges");
const outDir = join(base, "plan2-rect-parents");
const parentsDir = join(outDir, "parents");
const publicDir = join(process.cwd(), "public/badge-custom-backgrounds");

const JOBS = [
  {
    stem: "Nursing-Homes-Assisted-Living-Badges-Hearth-(1.5x3)",
    templateId: "rect-1_5x3",
    orig: "Nursing-Homes-Assisted-Living-Badges-Hearth-(1.5x3)-main-preview.jpg",
    badge: { left: 88, top: 422, width: 1322, height: 656 },
    // Windows of plain grid used to measure the pattern (face pixel coords), plus
    // the previous render's grid spacing as a starting estimate.
    hBand: [692, 752],
    topBand: [8, 90],
    vWindows: [
      [8, 92],
      [672, 760],
    ],
    diePeriodX: 83.69,
    diePeriodY: 62.9,
  },
  {
    stem: "Nursing-Homes-Assisted-Living-Badges-Hearth-(1x3)",
    templateId: "rect-1x3",
    orig: "Nursing-Homes-Assisted-Living-Badges-Hearth-(1x3)-main-preview.jpg",
    badge: { left: 95, top: 534, width: 1301, height: 432 },
    hBand: [448, 502],
    topBand: [8, 38],
    vWindows: [
      [8, 74],
      [432, 508],
    ],
    diePeriodX: 84.23,
    diePeriodY: 62.5,
  },
];

function solve3(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let q = i + 1; q < 3; q++) if (Math.abs(m[q][i]) > Math.abs(m[p][i])) p = q;
    [m[i], m[p]] = [m[p], m[i]];
    const d = m[i][i];
    for (let c = i; c < 4; c++) m[i][c] /= d;
    for (let q = 0; q < 3; q++) {
      if (q === i) continue;
      const f = m[q][i];
      for (let c = i; c < 4; c++) m[q][c] -= f * m[i][c];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

// Sub-pixel centres of the lighter grid lines in a 1-D brightness profile.
function lineCentres(profile, from, to) {
  const baseline = profile.map((_, i) => {
    let sum = 0, count = 0;
    for (let k = -30; k <= 30; k++) {
      const j = i + k;
      if (j >= from && j < to) { sum += profile[j]; count++; }
    }
    return count ? sum / count : profile[i];
  });
  const res = profile.map((v, i) => v - baseline[i]);
  const centres = [];
  for (let i = from + 3; i < to - 3; i++) {
    if (res[i] < 4 || res[i] < res[i - 1] || res[i] < res[i + 1]) continue;
    let num = 0, den = 0;
    for (let o = -3; o <= 3; o++) {
      const w = Math.max(0, res[i + o]);
      num += w * (i + o);
      den += w;
    }
    if (den > 0) centres.push(num / den);
    i += 20;
  }
  return centres;
}

// Robust spacing + phase. The expected spacing (the previous render's, rescaled)
// only has to be good enough to index the detected lines; least squares over the
// full span then pins the spacing and phase down to a fraction of a pixel.
function fitLattice(centres, expected) {
  let period = expected;
  for (let pass = 0; pass < 4; pass++) {
    const kept = centres
      .map((c) => ({ c, k: Math.round((c - centres[0]) / period) }))
      .filter(({ c, k }) => Math.abs(c - centres[0] - k * period) < period * 0.12);
    const n = kept.length;
    const sk = kept.reduce((a, p) => a + p.k, 0);
    const sc = kept.reduce((a, p) => a + p.c, 0);
    const skk = kept.reduce((a, p) => a + p.k * p.k, 0);
    const skc = kept.reduce((a, p) => a + p.k * p.c, 0);
    period = (n * skc - sk * sc) / (n * skk - sk * sk);
    var phase = (sc - period * sk) / n;
  }
  return { period, phase };
}

async function buildJob(job) {
  const s = sizesForTemplate(job.templateId);
  const W = s.bleedW, H = s.bleedH;
  const faceW = W;
  const faceH = Math.round((job.badge.height * W) / job.badge.width);
  const offY = Math.round((H - faceH) / 2);
  const face = (
    await sharp(join(base, job.orig))
      .extract(job.badge)
      .resize(faceW, faceH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  ).data;
  const at = (x, y) => {
    const i = (y * faceW + x) * 3;
    return [face[i], face[i + 1], face[i + 2]];
  };
  const lum = (x, y) => {
    const i = (y * faceW + x) * 3;
    return (face[i] + face[i + 1] + face[i + 2]) / 3;
  };
  const rB = s.radiusPx * (faceW / s.dieW);

  // Vertical lines: averaged over a clean band of rows.
  const colProfile = [];
  for (let x = 0; x < faceW; x++) {
    let sum = 0;
    for (let y = job.hBand[0]; y < job.hBand[1]; y++) sum += lum(x, y);
    colProfile.push(sum / (job.hBand[1] - job.hBand[0]));
  }
  const vert = fitLattice(
    lineCentres(colProfile, 250, faceW - 20),
    job.diePeriodX * (faceW / s.dieW),
  );

  // Horizontal lines: averaged over clean columns, measured in two row windows
  // (above and below the pale panel) and fitted as one lattice.
  const rowProfile = [];
  for (let y = 0; y < faceH; y++) {
    let sum = 0;
    for (let x = 400; x < 1400; x++) sum += lum(x, y);
    rowProfile.push(sum / 1000);
  }
  const hCentres = job.vWindows.flatMap(([a, b]) => lineCentres(rowProfile, a, b));
  const horiz = fitLattice(hCentres, job.diePeriodY * (faceH / s.dieH));

  const distTo = ({ period, phase }, v) => {
    const d = v - phase;
    return d - Math.round(d / period) * period;
  };

  // Background colour plane, fitted only on pixels away from the lines.
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let y = 0; y < faceH; y += 2)
    for (let x = 0; x < faceW; x += 2) {
      if (Math.abs(distTo(vert, x)) < 7 || Math.abs(distTo(horiz, y)) < 7) continue;
      const c = at(x, y);
      const L = (c[0] + c[1] + c[2]) / 3, rg = c[0] - c[1], br = c[2] - c[0];
      if (L < 118 || L > 205 || rg < 18 || rg > 44 || br < -4 || br > 9) continue;
      const xn = x / faceW, yn = y / faceH;
      n++; sx += xn; sy += yn; sxx += xn * xn; syy += yn * yn; sxy += xn * yn;
      for (let k = 0; k < 3; k++) {
        sums[k][0] += c[k];
        sums[k][1] += c[k] * xn;
        sums[k][2] += c[k] * yn;
      }
    }
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
  const plane = sums.map((v) => solve3(A, v));
  const planeAt = (x, y) => plane.map((p) => p[0] + p[1] * (x / faceW) + p[2] * (y / faceH));

  // Line cross-sections, as an additive offset from the background plane. The
  // lines do not land on whole pixels, so the profile is binned at quarter-pixel
  // resolution; rounding it would blur the synthesised lines.
  const SPAN = 6;
  const STEPS = 4;
  const BINS = 2 * SPAN * STEPS + 1;
  const measureProfile = (axis, band) => {
    const acc = Array.from({ length: BINS }, () => [0, 0, 0, 0]);
    for (let y = band[0]; y < band[1]; y++)
      for (let x = 300; x < faceW - 40; x++) {
        const along = axis === "v" ? y : x;
        const across = axis === "v" ? x : y;
        if (Math.abs(distTo(axis === "v" ? horiz : vert, along)) < 8) continue;
        const o = distTo(axis === "v" ? vert : horiz, across);
        if (Math.abs(o) > SPAN) continue;
        const c = at(x, y), p = planeAt(x, y);
        const t = (o + SPAN) * STEPS, lo = Math.floor(t), w = t - lo;
        for (const [bin, weight] of [[lo, 1 - w], [lo + 1, w]]) {
          if (bin < 0 || bin >= BINS || weight <= 0) continue;
          for (let k = 0; k < 3; k++) acc[bin][k] += (c[k] - p[k]) * weight;
          acc[bin][3] += weight;
        }
      }
    return acc.map((b) => (b[3] > 0 ? [b[0] / b[3], b[1] / b[3], b[2] / b[3]] : null));
  };
  const sampleProfile = (profile, o) => {
    if (Math.abs(o) > SPAN) return [0, 0, 0];
    const t = (o + SPAN) * STEPS, lo = Math.floor(t), w = t - lo;
    const a = profile[lo] ?? [0, 0, 0], b = profile[Math.min(BINS - 1, lo + 1)] ?? a;
    return [0, 1, 2].map((k) => a[k] * (1 - w) + b[k] * w);
  };
  // One model per end of the badge: line contrast changes with the background.
  const models = {
    top: { v: measureProfile("v", job.topBand), h: measureProfile("h", job.topBand), tone: [0, 0, 0] },
    bottom: { v: measureProfile("v", job.hBand), h: measureProfile("h", job.hBand), tone: [0, 0, 0] },
  };
  let model = models.bottom;
  const gridColour = (x, y) => {
    const p = planeAt(x, y);
    const v = sampleProfile(model.v, distTo(vert, x));
    const h = sampleProfile(model.h, distTo(horiz, y));
    return p.map((b, k) =>
      Math.max(0, Math.min(255, Math.round(b + v[k] + h[k] + model.tone[k]))),
    );
  };

  // Residual tone of the plain grid just inside the top and bottom edges, so the
  // synthesised strips meet the artwork without a step in colour.
  const compare = (y0, y1) => {
    const sum = [0, 0, 0];
    let count = 0, err = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 300; x < faceW - 300; x++) {
        const c = at(x, y), g = gridColour(x, y);
        for (let k = 0; k < 3; k++) {
          sum[k] += c[k] - g[k];
          err += Math.abs(c[k] - g[k]);
        }
        count++;
      }
    return { bias: sum.map((v) => v / count), err: err / (count * 3) };
  };
  model = models.top;
  models.top.tone = compare(4, 22).bias;
  const errTop = compare(4, 22).err;
  model = models.bottom;
  models.bottom.tone = compare(faceH - 22, faceH - 4).bias;
  const errBottom = compare(faceH - 22, faceH - 4).err;

  const inBadge = (x, y, inset) => {
    if (x < inset || y < inset || x >= faceW - inset || y >= faceH - inset) return false;
    const cx = x < rB ? rB : x >= faceW - rB ? faceW - 1 - rB : x;
    const cy = y < rB ? rB : y >= faceH - rB ? faceH - 1 - rB : y;
    if (x === cx || y === cy) return true;
    return Math.hypot(x - cx, y - cy) <= rB - inset;
  };

  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < faceH; y++) {
    const Y = y + offY;
    if (Y >= 0 && Y < H) face.copy(out, Y * W * 3, y * faceW * 3, (y * faceW + faceW) * 3);
  }
  let synth = 0;
  for (let Y = 0; Y < H; Y++) {
    const fy = Y - offY;
    model = fy < faceH / 2 ? models.top : models.bottom;
    for (let X = 0; X < W; X++) {
      if (inBadge(X, fy, 3)) continue;
      const c = gridColour(X, fy);
      const a = (Y * W + X) * 3;
      out[a] = c[0]; out[a + 1] = c[1]; out[a + 2] = c[2];
      synth++;
    }
  }

  const buf = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const parentPath = join(parentsDir, `${job.stem}-parent.png`);
  writeFileSync(parentPath, buf);
  await processParent({
    parentPath,
    templateId: job.templateId,
    stem: job.stem,
    outDir,
    coverPosition: "centre",
  });
  writeFileSync(
    join(publicDir, `${job.stem}-bleed.png`),
    readFileSync(join(outDir, "print-bleed", `${job.stem}-bleed.png`)),
  );
  console.log(
    `${job.stem}: face ${faceW}x${faceH} offY ${offY} | lines x ${vert.period.toFixed(2)}@${vert.phase.toFixed(1)} y ${horiz.period.toFixed(2)}@${horiz.phase.toFixed(1)} | synth px ${synth} | mean abs err top ${errTop.toFixed(2)} bottom ${errBottom.toFixed(2)}`,
  );
}

for (const job of JOBS) await buildJob(job);
