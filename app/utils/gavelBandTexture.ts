import type { BadgeLine } from "~/types/badge";
import {
  clampGavelLogoGapScale,
  clampGavelLogoScale,
  GAVEL_BAND_GOLD_HEX,
  GAVEL_BAND_TEXTURE_HEIGHT_PX,
  GAVEL_BAND_TEXTURE_WIDTH_PX,
  GAVEL_DEFAULT_FONT,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_MAX_LINES,
  GAVEL_TEXTURE_FONT_PX,
  SOUND_BLOCK_TOP_TEXTURE_PX,
  STAND_PLATE_CORNER_R_IN,
  STAND_PLATE_H_IN,
  STAND_PLATE_KEYLINE_INSET_IN,
  STAND_PLATE_KEYLINE_W_IN,
  STAND_PLATE_TEXTURE_H_PX,
  STAND_PLATE_TEXTURE_W_PX,
  STAND_PLATE_W_IN,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { standPlateOutline } from "~/utils/standPlateOutline";

export type GavelBandLineInput = {
  text?: string;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};

function fontCss(
  line: GavelBandLineInput,
  sizePx: number,
): string {
  const weight = line.bold ? "700" : "600";
  const style = line.italic ? "italic" : "normal";
  const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
  return `${style} ${weight} ${sizePx}px "${family}", Georgia, serif`;
}

function parseHexRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  let s = hex.trim();
  if (!s) return null;
  if (s[0] !== "#") s = `#${s}`;
  if (s.length === 4) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16),
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function rgbCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(clamp255(r))},${Math.round(clamp255(g))},${Math.round(clamp255(b))})`;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function hashHex(hex: string): number {
  let h = 2166136261;
  for (let i = 0; i < hex.length; i++) {
    h ^= hex.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Painted metal backgrounds, keyed by size and color. Synthesizing the grain
 * costs thousands of strokes plus a per-pixel pass, and the result depends only
 * on the key — so live text and logo edits blit a finished copy instead of
 * repainting it for every keystroke and slider move.
 */
const brushedMetalCache = new Map<string, HTMLCanvasElement>();
const BRUSHED_METAL_CACHE_MAX = 6;

function brushedMetalCanvas(
  width: number,
  height: number,
  bandHex: string,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${width}x${height}:${bandHex.trim().toLowerCase()}`;
  const cached = brushedMetalCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintBrushedMetalBand(ctx, width, height, bandHex);

  if (brushedMetalCache.size >= BRUSHED_METAL_CACHE_MAX) {
    const oldest = brushedMetalCache.keys().next().value;
    if (oldest !== undefined) brushedMetalCache.delete(oldest);
  }
  brushedMetalCache.set(key, canvas);
  return canvas;
}

/**
 * Satin brushed metal matching the physical gavel band: warm (or cool) mid-tone,
 * bright rim highlights, and fine horizontal grain. Seeded so the grain is stable
 * across re-renders.
 */
export function fillBrushedMetalBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bandHex: string,
) {
  const cached = brushedMetalCanvas(width, height, bandHex);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
    return;
  }
  paintBrushedMetalBand(ctx, width, height, bandHex);
}

function paintBrushedMetalBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bandHex: string,
) {
  const base =
    parseHexRgb(bandHex) ?? parseHexRgb(GAVEL_BAND_GOLD_HEX)!;
  const warm = base.r > base.b + 20;
  const highlightTint = warm
    ? { r: 253, g: 245, b: 166 }
    : { r: 244, g: 246, b: 248 };
  const shadowTint = warm
    ? { r: 88, g: 60, b: 16 }
    : { r: 70, g: 74, b: 82 };

  const highlight = mixRgb(base, highlightTint, 0.7);
  const light = mixRgb(base, highlightTint, 0.36);
  const rich = mixRgb(base, shadowTint, 0.26);
  const shadow = mixRgb(base, shadowTint, 0.5);

  const vert = ctx.createLinearGradient(0, 0, 0, height);
  vert.addColorStop(0, rgbCss(highlight.r, highlight.g, highlight.b));
  vert.addColorStop(0.1, rgbCss(light.r, light.g, light.b));
  vert.addColorStop(0.36, rgbCss(base.r, base.g, base.b));
  vert.addColorStop(0.58, rgbCss(rich.r, rich.g, rich.b));
  vert.addColorStop(0.86, rgbCss(shadow.r, shadow.g, shadow.b));
  vert.addColorStop(
    1,
    rgbCss(light.r * 0.9, light.g * 0.9, light.b * 0.9),
  );
  ctx.fillStyle = vert;
  ctx.fillRect(0, 0, width, height);

  const sheen = ctx.createLinearGradient(0, 0, width, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0.03)");
  sheen.addColorStop(0.2, "rgba(255,255,255,0.1)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0.02)");
  sheen.addColorStop(0.61, "rgba(255,255,255,0.09)");
  sheen.addColorStop(0.8, "rgba(0,0,0,0.06)");
  sheen.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(hashHex(bandHex.toLowerCase()) ^ 0x9e3779b9);
  const lightRgb = warm ? "255,246,196" : "255,255,255";
  const darkRgb = warm ? "68,46,12" : "38,42,48";
  const strokeCount = Math.max(2200, Math.round(width * height * 0.0065));
  for (let i = 0; i < strokeCount; i++) {
    const roll = rand();
    const len =
      roll < 0.62
        ? 18 + rand() * 70
        : roll < 0.9
          ? 70 + rand() * 110
          : 140 + rand() * 160;
    const x0 = rand() * Math.max(1, width - len);
    const y = rand() * height;
    const brighter = rand() > 0.38;
    const alpha = 0.05 + rand() * (brighter ? 0.2 : 0.14);
    const thickness = rand() > 0.88 ? 2 : 1;
    ctx.fillStyle = `rgba(${brighter ? lightRgb : darkRgb},${alpha})`;
    ctx.fillRect(x0, y, len, thickness);
  }

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const run = 6 + Math.floor(rand() * 36);
      const amp = (rand() - 0.5) * 20;
      for (let dx = 0; dx < run && x + dx < width; dx++) {
        const edge = Math.min(dx, run - 1 - dx);
        const fade = Math.min(1, edge / 3);
        const delta = amp * fade;
        const i = (y * width + x + dx) * 4;
        data[i] = clamp255(data[i] + delta);
        data[i + 1] = clamp255(data[i + 1] + delta * 0.95);
        data[i + 2] = clamp255(
          data[i + 2] + delta * (warm ? 0.82 : 0.98),
        );
      }
      x += run;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function activeLines(lines: readonly GavelBandLineInput[]): GavelBandLineInput[] {
  return lines
    .slice(0, GAVEL_MAX_LINES)
    .filter((l) => (l.text ?? "").trim().length > 0);
}

function bandTextLayout(
  filledCount: number,
  preset: GavelTextSizePreset,
  canvasHeight: number = GAVEL_BAND_TEXTURE_HEIGHT_PX,
  fill: number = 0.86,
) {
  const fontPx = GAVEL_TEXTURE_FONT_PX[preset];
  const lineGap = fontPx * 0.22;
  const rawBlock =
    filledCount * fontPx + Math.max(0, filledCount - 1) * lineGap;
  const maxBlock = canvasHeight * fill;
  const scale = rawBlock > maxBlock ? maxBlock / rawBlock : 1;
  const drawPx = fontPx * scale;
  const drawGap = lineGap * scale;
  const blockHeight =
    filledCount * drawPx + Math.max(0, filledCount - 1) * drawGap;
  const y0 = (canvasHeight - blockHeight) / 2 + drawPx * 0.78;
  return { drawPx, drawGap, y0 };
}

/**
 * Paint the unwrapped band (metal + up to 4 centered text lines) onto a canvas.
 * Used for the 3D wrap texture, the flat proof strip, and print SVG raster.
 */
export function paintGavelBandCanvas(
  canvas: HTMLCanvasElement,
  lines: readonly GavelBandLineInput[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { solidFill?: boolean; logo?: GavelPlateLogo | null },
): HTMLCanvasElement {
  const width = GAVEL_BAND_TEXTURE_WIDTH_PX;
  const height = GAVEL_BAND_TEXTURE_HEIGHT_PX;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (options?.solidFill) {
    ctx.fillStyle = bandHex;
    ctx.fillRect(0, 0, width, height);
  } else {
    fillBrushedMetalBand(ctx, width, height, bandHex);
  }

  const filled = activeLines(lines);
  const logo = options?.logo;
  if (filled.length === 0 && !logo?.image) return canvas;

  const { drawPx, drawGap, y0 } = bandTextLayout(filled.length, preset);
  let y = y0;
  let textCenterX = width / 2;

  if (logo?.image) {
    const maxH = height * 0.68 * clampGavelLogoScale(logo.scale ?? 1);
    const maxW = width * 0.16;
    const aspect = Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1;
    const logoW = Math.min(maxW, maxH * aspect);
    const logoH = logoW / aspect;
    const hasCopy = filled.length > 0;
    const logoX = hasCopy ? width * 0.34 - logoW / 2 : (width - logoW) / 2;
    ctx.drawImage(logo.image, logoX, (height - logoH) / 2, logoW, logoH);
    if (hasCopy) textCenterX = width * 0.59;
  }

  for (const line of filled) {
    ctx.font = fontCss(line, drawPx);
    ctx.fillStyle = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText((line.text ?? "").trim(), textCenterX, y);
    y += drawPx + drawGap;
  }

  return canvas;
}

export function gavelBandToDataUrl(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { solidFill?: boolean; logo?: GavelPlateLogo | null },
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  paintGavelBandCanvas(canvas, lines, preset, bandHex, options);
  return canvas.toDataURL("image/png");
}

/** Plate-space inches → canvas pixels. The silhouette fills the canvas exactly. */
function standPlateToPx(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (p.x / STAND_PLATE_W_IN + 0.5) * STAND_PLATE_TEXTURE_W_PX,
    y: (0.5 - p.y / STAND_PLATE_H_IN) * STAND_PLATE_TEXTURE_H_PX,
  };
}

/** The cut edge of the plaque in canvas pixels. */
function standPlateEdgePath(): { x: number; y: number }[] {
  return standPlateOutline().map(standPlateToPx);
}

/**
 * The keyline path in canvas pixels: the plate silhouette shrunk by the
 * measured inset, so the engraved line runs parallel to the physical edge
 * around the cove ends as well as the straight runs.
 */
function standPlateKeylinePath(): { x: number; y: number }[] {
  const inset = STAND_PLATE_KEYLINE_INSET_IN;
  return standPlateOutline(
    STAND_PLATE_W_IN / 2 - inset,
    STAND_PLATE_H_IN / 2 - inset,
  ).map(standPlateToPx);
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  path: readonly { x: number; y: number }[],
) {
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** Keyline width in canvas pixels, so it stays even as the plate is retuned. */
function standPlateKeylinePx(): number {
  return (
    (STAND_PLATE_KEYLINE_W_IN / STAND_PLATE_W_IN) * STAND_PLATE_TEXTURE_W_PX
  );
}

/** A customer logo placed on the stand plate, left of the personalized text. */
export type GavelPlateLogo = {
  /** Decoded art for canvas painting (3D texture and flat proof). */
  image?: CanvasImageSource | null;
  /** Same art as a data URL, so the manufacturing SVG can embed it. */
  href?: string | null;
  /** Source width ÷ height, so the art is placed without stretching. */
  aspect: number;
  /** Customer size adjustment; 1 is the tuned default. */
  scale?: number;
  /** Customer margin adjustment; 1 is the tuned default. */
  gapScale?: number;
};

const STAND_PLATE_PX_PER_IN = STAND_PLATE_TEXTURE_W_PX / STAND_PLATE_W_IN;

/** Plate edge → usable artwork: the keyline inset plus the keyline itself. */
function standPlateSafeInsetPx(): number {
  return (
    STAND_PLATE_KEYLINE_INSET_IN * STAND_PLATE_PX_PER_IN +
    standPlateKeylinePx()
  );
}

/**
 * Logo height as a multiple of the text block height, its share of the plate
 * width, and the margin before the text as a share of plate height. All three
 * are tuned against the proof rather than derived.
 */
const STAND_PLATE_LOGO_TEXT_RATIO = 3;
const STAND_PLATE_LOGO_MAX_W_FRACTION = 0.26;
const STAND_PLATE_LOGO_GAP_FRACTION = 0.12;

/** Widest line and total block height of the plate text, in canvas px. */
function plateTextMetrics(
  ctx: CanvasRenderingContext2D | null,
  filled: readonly GavelBandLineInput[],
  drawPx: number,
  drawGap: number,
): { width: number; height: number } {
  if (!filled.length) return { width: 0, height: 0 };
  let width = 0;
  for (const line of filled) {
    const text = (line.text ?? "").trim();
    if (ctx) {
      ctx.font = fontCss(line, drawPx);
      width = Math.max(width, ctx.measureText(text).width);
    } else {
      // Server render has no canvas to measure with; estimate so the lockup is
      // still roughly centered.
      width = Math.max(width, text.length * drawPx * 0.52);
    }
  }
  return {
    width,
    height: filled.length * drawPx + Math.max(0, filled.length - 1) * drawGap,
  };
}

/**
 * Artwork layout for the plate. With a logo, the logo and the text are set as
 * one lockup — logo immediately left of the text with a small margin — and the
 * pair is centered on the plate. The canvas painter and the print SVG both read
 * this, so the proof and the manufacturing file cannot drift apart.
 */
function standPlateArtLayout(input: {
  logoAspect?: number | null;
  logoScale?: number | null;
  logoGapScale?: number | null;
  textWidth: number;
  textHeight: number;
}) {
  const width = STAND_PLATE_TEXTURE_W_PX;
  const height = STAND_PLATE_TEXTURE_H_PX;
  const inset = standPlateSafeInsetPx();
  const usableHeight = height - 2 * inset;
  const aspect = input.logoAspect;

  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) {
    return { logo: null, textCenterX: width / 2, textMaxWidth: width * 0.86 };
  }

  const scale = clampGavelLogoScale(input.logoScale ?? 1);
  const defaultGap = height * STAND_PLATE_LOGO_GAP_FRACTION;
  /** Breathing room between the logo and the first letter. */
  const gap = defaultGap * clampGavelLogoGapScale(input.logoGapScale ?? 1);
  // Scale the logo to the text so the two read as one lockup rather than a
  // stamp at the end of the plate. With no text the logo carries the plate.
  const base =
    input.textHeight > 0
      ? input.textHeight * STAND_PLATE_LOGO_TEXT_RATIO
      : usableHeight;
  let h = Math.min(usableHeight, base * scale);
  let w = h * aspect;
  const maxWidth = width * STAND_PLATE_LOGO_MAX_W_FRACTION * scale;
  if (w > maxWidth) {
    w = maxWidth;
    h = w / aspect;
  }

  const slotGap = input.textWidth > 0 ? gap : 0;
  const available = width - 2 * inset - w - slotGap;
  const textWidth = Math.max(0, Math.min(input.textWidth, available));
  const groupWidth = w + slotGap + textWidth;
  // Keep the logo clear of the concave notch cut into the plate's left end.
  // This clearance ignores the customer's margin so a 0% margin cannot push the
  // art into the notch.
  const notch = STAND_PLATE_CORNER_R_IN * STAND_PLATE_PX_PER_IN;
  // Staying inside the safe area wins over the notch clearance, so a large logo
  // cannot push the text off the right end of the plate.
  const x = Math.min(
    Math.max((width - groupWidth) / 2, notch + defaultGap),
    Math.max(inset, width - inset - groupWidth),
  );

  return {
    logo: { x, y: (height - h) / 2, w, h },
    textCenterX: x + w + slotGap + textWidth / 2,
    textMaxWidth: Math.max(1, available),
  };
}

/**
 * Personalized stand plaque matching the product photos: brushed metal with a
 * dark keyline following the shouldered-cove silhouette.
 *
 * The canvas is kept at the plate's own aspect ratio. Painting it on the band's
 * much wider canvas (as a first pass did) squashed the artwork and made the
 * keyline thinner down the ends than across the top.
 */
export function paintGavelStandPlateCanvas(
  canvas: HTMLCanvasElement,
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  plateHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { shaped?: boolean; logo?: GavelPlateLogo | null },
): HTMLCanvasElement {
  const width = STAND_PLATE_TEXTURE_W_PX;
  const height = STAND_PLATE_TEXTURE_H_PX;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Shaped art is cut to the silhouette so the proof reads as the physical
  // plaque. The 3D texture stays full-bleed: its mesh is already cut to the
  // same outline, and transparent corners there would fringe dark.
  if (options?.shaped) {
    ctx.save();
    tracePath(ctx, standPlateEdgePath());
    ctx.clip();
  }

  fillBrushedMetalBand(ctx, width, height, plateHex);

  const dark = plateHex.trim().toLowerCase() === "#ffffff" ? "#4f5359" : "#231c13";
  tracePath(ctx, standPlateKeylinePath());
  ctx.lineJoin = "round";
  ctx.strokeStyle = dark;
  ctx.lineWidth = standPlateKeylinePx();
  ctx.stroke();

  if (options?.shaped) ctx.restore();

  const filled = activeLines(lines).slice(0, 2);
  const { drawPx, drawGap, y0 } = bandTextLayout(
    Math.max(1, filled.length),
    preset,
    height,
    0.62,
  );
  const metrics = plateTextMetrics(ctx, filled, drawPx, drawGap);
  const layout = standPlateArtLayout({
    logoAspect: options?.logo?.aspect,
    logoScale: options?.logo?.scale,
    logoGapScale: options?.logo?.gapScale,
    textWidth: metrics.width,
    textHeight: metrics.height,
  });

  if (options?.logo?.image && layout.logo) {
    ctx.drawImage(
      options.logo.image,
      layout.logo.x,
      layout.logo.y,
      layout.logo.w,
      layout.logo.h,
    );
  }

  if (!filled.length) return canvas;
  let y = y0;
  for (const line of filled) {
    ctx.font = fontCss(line, drawPx);
    ctx.fillStyle = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText(
      (line.text ?? "").trim(),
      layout.textCenterX,
      y,
      layout.textMaxWidth,
    );
    y += drawPx + drawGap;
  }
  return canvas;
}

export function gavelStandPlateToDataUrl(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  plateHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { shaped?: boolean; logo?: GavelPlateLogo | null },
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  paintGavelStandPlateCanvas(canvas, lines, preset, plateHex, options);
  return canvas.toDataURL("image/png");
}

/** Print-ready SVG of the unwrapped band (manufacturing artwork). */
export function gavelBandToSvgString(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { logo?: GavelPlateLogo | null },
): string {
  const width = GAVEL_BAND_TEXTURE_WIDTH_PX;
  const height = GAVEL_BAND_TEXTURE_HEIGHT_PX;
  const filled = activeLines(lines);
  const { drawPx, drawGap, y0 } = bandTextLayout(filled.length, preset);
  let y = y0;
  const logo = options?.logo;
  const maxLogoH =
    height * 0.68 * clampGavelLogoScale(logo?.scale ?? 1);
  const logoAspect =
    logo && Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1;
  const logoW = Math.min(width * 0.16, maxLogoH * logoAspect);
  const logoH = logoW / logoAspect;
  const hasLogo = Boolean(logo?.href);
  const logoX = filled.length > 0 ? width * 0.34 - logoW / 2 : (width - logoW) / 2;
  const logoEl =
    logo?.href
      ? `<image x="${logoX.toFixed(2)}" y="${((height - logoH) / 2).toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logo.href)}"/>`
      : "";
  const textCenterX = hasLogo && filled.length > 0 ? width * 0.59 : width / 2;

  const textEls = filled
    .map((line) => {
      const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
      const weight = line.bold ? 700 : 600;
      const fontStyle = line.italic ? "italic" : "normal";
      const color = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
      const text = escapeXml((line.text ?? "").trim());
      const el = `<text x="${textCenterX}" y="${y}" text-anchor="middle" font-family="${escapeXml(family)}, Georgia, serif" font-size="${drawPx}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(color)}">${text}</text>`;
      y += drawPx + drawGap;
      return el;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(bandHex)}"/>
  ${logoEl}
  ${textEls}
</svg>`;
}

/** Manufacturing SVG for the stand plaque, cut outline plus keyline. */
export function gavelStandPlateToSvgString(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  plateHex: string = GAVEL_BAND_GOLD_HEX,
  options?: { logo?: GavelPlateLogo | null },
): string {
  const width = STAND_PLATE_TEXTURE_W_PX;
  const height = STAND_PLATE_TEXTURE_H_PX;
  const filled = activeLines(lines).slice(0, 2);
  const { drawPx, drawGap, y0 } = bandTextLayout(
    filled.length,
    preset,
    height,
    0.62,
  );
  const measureCtx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  const metrics = plateTextMetrics(measureCtx, filled, drawPx, drawGap);
  const layout = standPlateArtLayout({
    logoAspect: options?.logo?.aspect,
    logoScale: options?.logo?.scale,
    logoGapScale: options?.logo?.gapScale,
    textWidth: metrics.width,
    textHeight: metrics.height,
  });
  const logoEl =
    options?.logo?.href && layout.logo
      ? `<image x="${layout.logo.x.toFixed(2)}" y="${layout.logo.y.toFixed(2)}" width="${layout.logo.w.toFixed(2)}" height="${layout.logo.h.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(options.logo.href)}"/>`
      : "";
  let y = y0;
  const textEls = filled
    .map((line) => {
      const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
      const weight = line.bold ? 700 : 600;
      const fontStyle = line.italic ? "italic" : "normal";
      const color = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
      const text = escapeXml((line.text ?? "").trim());
      const el = `<text x="${layout.textCenterX.toFixed(2)}" y="${y}" text-anchor="middle" font-family="${escapeXml(family)}, Georgia, serif" font-size="${drawPx}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(color)}">${text}</text>`;
      y += drawPx + drawGap;
      return el;
    })
    .join("\n");
  const toPath = (pts: { x: number; y: number }[]) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ") + " Z";
  const cutPath = toPath(
    standPlateOutline().map((p) => ({
      x: (p.x / STAND_PLATE_W_IN + 0.5) * width,
      y: (0.5 - p.y / STAND_PLATE_H_IN) * height,
    })),
  );
  const dark = plateHex.trim().toLowerCase() === "#ffffff" ? "#4f5359" : "#231c13";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <path d="${cutPath}" fill="${escapeXml(plateHex)}"/>
  <path d="${toPath(standPlateKeylinePath())}" fill="none" stroke="${dark}" stroke-width="${standPlateKeylinePx().toFixed(2)}" stroke-linejoin="round"/>
  ${logoEl}
  ${textEls}
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };

  const splitWord = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (!chunk || ctx.measureText(trial).width <= maxWidth) {
        chunk = trial;
      } else {
        lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      flush();
      splitWord(word);
      continue;
    }
    const trial = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = word;
    }
  }
  flush();
  return lines.length ? lines : [text.trim()];
}

function fitSoundBlockTopText(
  ctx: CanvasRenderingContext2D,
  line: GavelBandLineInput,
  maxWidth: number,
  maxHeight: number,
): { lines: string[]; fontPx: number; gap: number } {
  const text = (line.text ?? "").trim();
  let fontPx = Math.min(110, maxHeight * 0.28);
  const minPx = 22;
  while (fontPx >= minPx) {
    ctx.font = fontCss(line, fontPx);
    const wrapped = wrapCanvasText(ctx, text, maxWidth);
    const gap = fontPx * 0.22;
    const blockH =
      wrapped.length * fontPx + Math.max(0, wrapped.length - 1) * gap;
    const widest = Math.max(
      ...wrapped.map((row) => ctx.measureText(row).width),
      0,
    );
    if (blockH <= maxHeight && widest <= maxWidth) {
      return { lines: wrapped, fontPx, gap };
    }
    fontPx -= 2;
  }
  ctx.font = fontCss(line, minPx);
  return {
    lines: wrapCanvasText(ctx, text, maxWidth),
    fontPx: minPx,
    gap: minPx * 0.22,
  };
}

/**
 * Square personalization for the sound-block top: transparent background so
 * the wood grain shows through in 3D, with centered wrapping text.
 */
export function paintSoundBlockTopCanvas(
  canvas: HTMLCanvasElement,
  line: GavelBandLineInput,
  textColor: string = GAVEL_DEFAULT_TEXT_COLOR,
  options?: { logo?: GavelPlateLogo | null },
): HTMLCanvasElement {
  const size = SOUND_BLOCK_TOP_TEXTURE_PX;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, size, size);
  const text = (line.text ?? "").trim();
  const logo = options?.logo;
  if (!text && !logo?.image) return canvas;

  const inset = size * 0.14;
  const maxWidth = size - inset * 2;
  const hasLogo = Boolean(logo?.image);
  const maxHeight = hasLogo ? size * 0.34 : size - inset * 2;
  const colored = { ...line, color: textColor };
  const { lines, fontPx, gap } = text
    ? fitSoundBlockTopText(ctx, colored, maxWidth, maxHeight)
    : { lines: [], fontPx: 0, gap: 0 };
  const blockH = lines.length * fontPx + Math.max(0, lines.length - 1) * gap;
  let y = hasLogo
    ? size * 0.62 + fontPx * 0.78
    : (size - blockH) / 2 + fontPx * 0.78;

  if (logo?.image) {
    const aspect = Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1;
    const maxLogoH = size * 0.34 * clampGavelLogoScale(logo.scale ?? 1);
    const logoW = Math.min(size * 0.52, maxLogoH * aspect);
    const logoH = logoW / aspect;
    const logoY = text ? size * 0.17 : (size - logoH) / 2;
    ctx.save();
    ctx.drawImage(logo.image, (size - logoW) / 2, logoY, logoW, logoH);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#000000";
    ctx.fillRect((size - logoW) / 2, logoY, logoW, logoH);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = textColor;
  ctx.font = fontCss(colored, fontPx);
  for (const row of lines) {
    ctx.fillText(row, size / 2, y);
    y += fontPx + gap;
  }
  return canvas;
}

export function soundBlockTopToDataUrl(
  line: GavelBandLineInput,
  textColor: string = GAVEL_DEFAULT_TEXT_COLOR,
  options?: { logo?: GavelPlateLogo | null },
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  paintSoundBlockTopCanvas(canvas, line, textColor, options);
  return canvas.toDataURL("image/png");
}

export function soundBlockTopToSvgString(
  line: GavelBandLineInput,
  textColor: string = GAVEL_DEFAULT_TEXT_COLOR,
  options?: { logo?: GavelPlateLogo | null },
): string {
  const size = SOUND_BLOCK_TOP_TEXTURE_PX;
  const text = (line.text ?? "").trim();
  const logo = options?.logo;
  if (!text && !logo?.href) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"></svg>`;
  }

  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d") ?? null;
  const inset = size * 0.14;
  const maxWidth = size - inset * 2;
  const hasLogo = Boolean(logo?.href);
  const maxHeight = hasLogo ? size * 0.34 : size - inset * 2;
  const colored = { ...line, color: textColor };
  let lines = text ? [text] : [];
  let fontPx = 64;
  let gap = fontPx * 0.22;
  if (ctx && text) {
    const fitted = fitSoundBlockTopText(ctx, colored, maxWidth, maxHeight);
    lines = fitted.lines;
    fontPx = fitted.fontPx;
    gap = fitted.gap;
  }
  const blockH = lines.length * fontPx + Math.max(0, lines.length - 1) * gap;
  let y = hasLogo
    ? size * 0.62 + fontPx * 0.78
    : (size - blockH) / 2 + fontPx * 0.78;
  const logoAspect =
    logo && Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1;
  const maxLogoH =
    size * 0.34 * clampGavelLogoScale(logo?.scale ?? 1);
  const logoW = Math.min(size * 0.52, maxLogoH * logoAspect);
  const logoH = logoW / logoAspect;
  const logoY = text ? size * 0.17 : (size - logoH) / 2;
  const logoEl =
    logo?.href
      ? `<image x="${((size - logoW) / 2).toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logo.href)}" filter="url(#black-ink-logo)"/>`
      : "";
  const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
  const weight = line.bold ? 700 : 600;
  const fontStyle = line.italic ? "italic" : "normal";
  const textEls = lines
    .map((row) => {
      const el = `<text x="${size / 2}" y="${y}" text-anchor="middle" font-family="${escapeXml(family)}, Georgia, serif" font-size="${fontPx}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(textColor)}">${escapeXml(row)}</text>`;
      y += fontPx + gap;
      return el;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${
    logo?.href
      ? `<defs>
    <filter id="black-ink-logo" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
    </filter>
  </defs>`
      : ""
  }
  ${logoEl}
  ${textEls}
</svg>`;
}
