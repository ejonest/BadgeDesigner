import type { PenPreviewPhoto } from "~/constants/pen";
import { layoutEngraving, lineOffsets, penLockup } from "~/utils/penEngraving";
import type { PenLogoInk } from "~/utils/penRender";

export interface PreviewPaintInput {
  photo: PenPreviewPhoto;
  text: string;
  fontStack: string;
  bold: boolean;
  italic: boolean;
  logo?: PenLogoInk | null;
}

/**
 * Extra tracking, in ems. The vendor's own cap engraving runs noticeably
 * open, and tight lettering reads as printed rather than etched.
 */
const TRACKING = 0.18;
/** How much of the etch covers the barrel where the glyph is solid. */
const INK_OPACITY = 0.9;
/** Brightness where the barrel has curved fully away from the light. */
const SHADE_FLOOR = 0.72;
/**
 * Half-angle of barrel that the unrolled lettering spans, in radians. The
 * lettering is inset well inside this, so it only has to be wide enough to
 * cover the glyphs, not the whole silhouette.
 */
const ARC = 1;

function solveUv(
  x: number,
  y: number,
  origin: readonly [number, number],
  u: readonly [number, number],
  v: readonly [number, number],
): [number, number] | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-6) return null;
  const px = x - origin[0];
  const py = y - origin[1];
  const su = (px * v[1] - py * v[0]) / den;
  const sv = (px * u[1] - py * u[0]) / -den;
  if (su < 0 || su > 1 || sv < 0 || sv > 1) return null;
  return [su, sv];
}

/** Bilinear coverage, 0–1. Only the glyph mask matters, never its colour. */
function sampleCoverage(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (ix: number, iy: number) => data[(iy * w + ix) * 4 + 3];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bot = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return (top + (bot - top) * ty) / 255;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function parseRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [232, 238, 242];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paints cap lettering as a shallow laser engraving: the glyphs wrap around
 * the barrel and dim as it curves away from the light.
 *
 * The engraving is drawn as its own translucent layer and left for the
 * browser to composite over the photo, so it needs no blend mode and never
 * reads the photo's pixels.
 */
export async function paintCylindricalEngraving(
  canvas: HTMLCanvasElement,
  input: PreviewPaintInput,
): Promise<void> {
  const { photo, text, fontStack, bold, italic } = input;
  const [origin, along, , across] = photo.quad;
  const u = [along[0] - origin[0], along[1] - origin[1]] as const;
  const v = [across[0] - origin[0], across[1] - origin[1]] as const;
  const planeW = Math.hypot(u[0], u[1]);
  const planeH = Math.hypot(v[0], v[1]);
  if (planeW < 4 || planeH < 4) return;

  // The backing store follows the laid-out box rather than the photo's
  // intrinsic size: the cap photo is 400px wide but renders up to 560, and
  // sizing to the photo left every glyph upscaled and soft.
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.getBoundingClientRect().width || photo.width;
  const destScale = Math.max(1, (cssWidth * dpr) / photo.width);
  const destW = Math.max(1, Math.round(photo.width * destScale));
  const destH = Math.max(1, Math.round(photo.height * destScale));
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const insetX = planeW * photo.inset;
  const insetY = planeH * photo.inset;
  const usable = {
    width: planeW - insetX * 2,
    height: planeH - insetY * 2,
  };
  const inkArt = input.logo?.href ? await loadImage(input.logo.href) : null;
  const lockup = penLockup(usable, {
    logoAspect: inkArt ? input.logo?.aspect : null,
    hasText: Boolean(text.trim()),
    placement: photo.logoPlacement,
  });
  let layout = layoutEngraving(
    text,
    { width: lockup.text.width, height: lockup.text.height },
    {
      maxFontSize: planeH * photo.maxTextScale,
      maxLines: photo.maxLines,
      letterSpacingEm: TRACKING,
    },
  );
  if (!layout.lines.length && !inkArt) return;

  // Supersample past the destination so the warp below only ever downsamples.
  const scale = Math.min(12, destScale * 2);
  const srcW = Math.max(8, Math.round(planeW * scale));
  const srcH = Math.max(8, Math.round(planeH * scale));
  const off = document.createElement("canvas");
  off.width = srcW;
  off.height = srcH;
  const src = off.getContext("2d");
  if (!src) return;

  // The mark is single-colour art whose alpha carries its coverage, so drawing
  // it into the unrolled layer lets the warp below wrap, tint, and light it
  // exactly like the lettering.
  if (inkArt && lockup.logo) {
    src.drawImage(
      inkArt,
      (insetX + lockup.logo.x) * scale,
      (insetY + lockup.logo.y) * scale,
      lockup.logo.width * scale,
      lockup.logo.height * scale,
    );
  }

  if (layout.lines.length) {
    const weight = bold ? 600 : 400;
    const style = italic ? "italic" : "normal";
    let fontSize = layout.fontSize * scale;
    const makeFont = (size: number) =>
      `${style} ${weight} ${size}px ${fontStack}`;
    try {
      await document.fonts.ready;
      await document.fonts.load(makeFont(fontSize));
    } catch {
      // System fallbacks still paint.
    }

    // The shared layout gives a server-safe estimate. In the browser, measure
    // the selected font's actual glyphs and shrink once more when needed.
    src.font = makeFont(fontSize);
    src.letterSpacing = "0px";
    const measuredWidth = Math.max(
      ...layout.lines.map((line) => {
        const metrics = src.measureText(line);
        const glyphWidth =
          metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
        return glyphWidth + Math.max(0, line.length - 1) * TRACKING * fontSize;
      }),
    );
    const maxWidth = lockup.text.width * scale * 0.98;
    if (measuredWidth > maxWidth) {
      const factor = maxWidth / measuredWidth;
      layout = {
        ...layout,
        fontSize: layout.fontSize * factor,
        lineSpacing: layout.lineSpacing * factor,
      };
      fontSize *= factor;
      src.font = makeFont(fontSize);
    }

    src.textAlign = "center";
    src.textBaseline = "middle";
    src.letterSpacing = `${TRACKING}em`;
    src.fillStyle = "#fff";

    // Canvas adds tracking after the last glyph too, which drags centred text
    // off-centre by half a space.
    const cx =
      (insetX + lockup.text.x + lockup.text.width / 2) * scale +
      (TRACKING * fontSize) / 2;
    const cy = (insetY + lockup.text.y + lockup.text.height / 2) * scale;
    for (const [index, offset] of lineOffsets(layout).entries()) {
      src.fillText(layout.lines[index], cx, cy + offset * scale);
    }
  }
  const srcPixels = src.getImageData(0, 0, srcW, srcH).data;

  const [inkR, inkG, inkB] = parseRgb(photo.color);
  const highlightV = photo.highlightV ?? 0.5;
  const highlightTheta = Math.asin(Math.max(-1, Math.min(1, highlightV * 2 - 1)));

  const xs = photo.quad.map((p) => p[0]);
  const ys = photo.quad.map((p) => p[1]);
  const minX = Math.max(0, Math.floor(Math.min(...xs) * destScale) - 1);
  const maxX = Math.min(destW - 1, Math.ceil(Math.max(...xs) * destScale) + 1);
  const minY = Math.max(0, Math.floor(Math.min(...ys) * destScale) - 1);
  const maxY = Math.min(destH - 1, Math.ceil(Math.max(...ys) * destScale) + 1);
  if (maxX <= minX || maxY <= minY) return;

  const dest = ctx.createImageData(destW, destH);
  const out = dest.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const uv = solveUv(
        (x + 0.5) / destScale,
        (y + 0.5) / destScale,
        origin,
        u,
        v,
      );
      if (!uv) continue;
      const [su, sv] = uv;

      // Across the barrel the photo shows sin(theta) while the engraving
      // itself runs along the arc. Normalising by ARC keeps the mapping 1:1
      // at the crown; the raw asin stretched the middle by pi/2 and blurred it.
      const theta = Math.asin(Math.max(-1, Math.min(1, sv * 2 - 1)));
      const srcV = 0.5 + theta / (2 * ARC);
      if (srcV < 0 || srcV > 1) continue;

      const coverage = sampleCoverage(
        srcPixels,
        srcW,
        srcH,
        su * (srcW - 1),
        srcV * (srcH - 1),
      );
      if (coverage < 0.004) continue;

      const lambert = Math.max(0, Math.cos(theta - highlightTheta));
      const shade = SHADE_FLOOR + (1 - SHADE_FLOOR) * lambert;
      const o = (y * destW + x) * 4;
      out[o] = inkR * shade;
      out[o + 1] = inkG * shade;
      out[o + 2] = inkB * shade;
      out[o + 3] = coverage * INK_OPACITY * 255;
    }
  }

  ctx.putImageData(dest, 0, 0);
}
