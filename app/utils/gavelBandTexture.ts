import type { BadgeLine } from "~/types/badge";
import {
  clampGavelLogoGapScale,
  clampGavelLogoScale,
  GAVEL_BAND_GOLD_HEX,
  gavelMetalTextureSet,
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
  STAND_PLATE_MAX_LINES,
  STAND_PLATE_TEXTURE_H_PX,
  STAND_PLATE_TEXTURE_W_PX,
  STAND_PLATE_W_IN,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { getReadyGavelMetalAlbedo } from "~/utils/gavelMetalTexture";
import { blackInkLogo, blackInkLogoDataUrl } from "~/utils/logoBlackInk";
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

type Rgb = { r: number; g: number; b: number };

/**
 * How far the light and dark ends of the surface travel from the base color.
 * All stay near 1: the photographed band and plaque vary only about 10% across
 * their own face, and a wider range is what buried engraved text in shadow.
 *
 * This is only the stand-in drawn before the scanned finish loads, so it is
 * tuned to sit close to the scan rather than to be interesting on its own.
 */
const METAL_TONE = {
  across: 1,
  along: 1.3,
  grain: 0.15,
  reflection: 0.012,
};

/** Light falloff across the height of the surface, as a multiple of the base. */
const METAL_ACROSS_STOPS: readonly (readonly [number, number])[] = [
  [0, 1.05],
  [0.1, 1.015],
  [0.42, 1],
  [0.74, 0.985],
  [0.93, 0.968],
  [1, 1.008],
];

/** The specular sweep along the surface — the part that reads as mirroring. */
const METAL_ALONG_STOPS: readonly (readonly [number, number])[] = [
  [0, 0.955],
  [0.13, 1.05],
  [0.25, 1.085],
  [0.39, 1.005],
  [0.53, 0.962],
  [0.67, 1.005],
  [0.81, 1.055],
  [0.92, 0.99],
  [1, 0.952],
];

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Piecewise stops eased into a per-pixel multiplier for one axis. */
function toneRamp(
  stops: readonly (readonly [number, number])[],
  length: number,
  amplitude: number,
): Float32Array {
  const out = new Float32Array(length);
  let seg = 0;
  for (let i = 0; i < length; i++) {
    const t = length === 1 ? 0 : i / (length - 1);
    while (seg < stops.length - 2 && t > stops[seg + 1][0]) seg++;
    const [t0, v0] = stops[seg];
    const [t1, v1] = stops[seg + 1];
    const span = t1 - t0;
    const k = span <= 0 ? 0 : smoothstep(Math.min(1, Math.max(0, (t - t0) / span)));
    out[i] = 1 + (v0 + (v1 - v0) * k - 1) * amplitude;
  }
  return out;
}

/**
 * A seeded band of fine variation along one axis, used for brush grain across
 * the plate and for the soft columns a polished surface reflects. Two octaves
 * keep it from reading as even pinstriping.
 */
function grainRamp(
  length: number,
  rand: () => number,
  amplitude: number,
): Float32Array {
  const fine = new Float32Array(length);
  for (let i = 0; i < length; i++) fine[i] = rand() * 2 - 1;

  const coarseCount = Math.max(2, Math.round(length / 9));
  const coarse = new Float32Array(coarseCount);
  for (let i = 0; i < coarseCount; i++) coarse[i] = rand() * 2 - 1;

  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // Softening the fine octave keeps each line a hairline rather than noise.
    const smoothed =
      (fine[(i - 1 + length) % length] + fine[i] * 2 + fine[(i + 1) % length]) / 4;
    const c = (i / length) * coarseCount;
    const c0 = Math.floor(c) % coarseCount;
    const c1 = (c0 + 1) % coarseCount;
    const wide = coarse[c0] + (coarse[c1] - coarse[c0]) * smoothstep(c - Math.floor(c));
    out[i] = 1 + (smoothed * 0.62 + wide * 0.38) * amplitude;
  }
  return out;
}

/**
 * Scale a metal color toward its highlight or shadow while holding its hue.
 * Blending toward cream and brown (what this did before) desaturated gold into
 * sand and dropped the dark end far enough to swallow the engraving.
 */
function toneMetal(base: Rgb, warm: boolean, factor: number): Rgb {
  if (factor <= 1) {
    return {
      r: base.r * factor,
      g: base.g * factor,
      // Warm metals lose blue as they fall off, so gold darkens to bronze.
      b: base.b * (warm ? factor * 0.93 : factor),
    };
  }
  // Highlights climb each channel's own headroom to white, which keeps the
  // brightest stops saturated instead of blowing out to a pale tint.
  const t = Math.min(1, (factor - 1) * 1.7);
  return {
    r: base.r + (255 - base.r) * t,
    g: base.g + (255 - base.g) * t * 0.93,
    b: base.b + (255 - base.b) * t * (warm ? 0.55 : 0.88),
  };
}

/** Quantized tone lookup, so the pixel loop does no per-pixel color math. */
const TONE_LUT_MIN = 0.82;
const TONE_LUT_MAX = 1.22;
const TONE_LUT_SIZE = 512;

function toneLut(base: Rgb, warm: boolean): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(TONE_LUT_SIZE * 3);
  for (let i = 0; i < TONE_LUT_SIZE; i++) {
    const factor =
      TONE_LUT_MIN +
      ((TONE_LUT_MAX - TONE_LUT_MIN) * i) / (TONE_LUT_SIZE - 1);
    const { r, g, b } = toneMetal(base, warm, factor);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

/**
 * Painted metal backgrounds, keyed by size and color. Synthesizing a surface
 * walks every pixel and the result depends only on the key — so live text and
 * logo edits blit a finished copy instead of repainting it for every keystroke
 * and slider move.
 */
const metalSurfaceCache = new Map<string, HTMLCanvasElement>();
const METAL_SURFACE_CACHE_MAX = 8;

function metalSurfaceCanvas(
  width: number,
  height: number,
  hex: string,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;

  const set = gavelMetalTextureSet(hex);
  const scan = set ? getReadyGavelMetalAlbedo(set) : null;
  // The scan arrives after first paint, so it is part of the key: the cached
  // stand-in has to be superseded rather than kept.
  const key = `${width}x${height}:${hex.trim().toLowerCase()}:${scan ? set : "flat"}`;
  const cached = metalSurfaceCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (scan) {
    paintScannedMetalSurface(ctx, width, height, scan);
  } else {
    paintGavelMetalSurface(ctx, width, height, hex);
  }

  if (metalSurfaceCache.size >= METAL_SURFACE_CACHE_MAX) {
    const oldest = metalSurfaceCache.keys().next().value;
    if (oldest !== undefined) metalSurfaceCache.delete(oldest);
  }
  metalSurfaceCache.set(key, canvas);
  return canvas;
}

/**
 * Shading laid over the scan. It is far shallower than the procedural finish
 * carries on its own: the scan already reads as metal, and a specular sweep on
 * top of it is what turned the band into a glare in the 3D viewer.
 */
const SCAN_ACROSS_AMPLITUDE = 0.3;

/**
 * The scanned brushed finish, tiled texel for texel. Fitting a repeat to each
 * surface instead would shrink the band's grain against the plaque's, when on
 * the real hardware both are cut from stock brushed to the same weight — and
 * shrinking it far enough averages the brush away into a flat fill.
 */
function paintScannedMetalSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scan: HTMLImageElement,
) {
  const pattern = ctx.createPattern(scan, "repeat");
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);

  const across = toneRamp(METAL_ACROSS_STOPS, height, SCAN_ACROSS_AMPLITUDE);
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let y = 0; y < height; y++) {
    const factor = across[y];
    if (factor === 1) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] *= factor;
      data[i + 1] *= factor;
      data[i + 2] *= factor;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * The brushed metal the band and the stand plaque are both cut from: an even
 * mid-tone held close enough to the base color that engraved text keeps its
 * contrast everywhere on the surface.
 */
export function fillGavelMetalSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hex: string,
) {
  // Always composited with drawImage: the surface is built as raw pixels, and
  // putImageData would ignore the silhouette clip the shaped plate draws under.
  const cached = metalSurfaceCanvas(width, height, hex);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
    return;
  }
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
}

function paintGavelMetalSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hex: string,
) {
  const base = parseHexRgb(hex) ?? parseHexRgb(GAVEL_BAND_GOLD_HEX)!;
  const warm = base.r > base.b + 20;
  const rand = mulberry32(hashHex(hex.toLowerCase()) ^ 0x9e3779b9);

  const across = toneRamp(METAL_ACROSS_STOPS, height, METAL_TONE.across);
  const along = toneRamp(METAL_ALONG_STOPS, width, METAL_TONE.along);
  const grain = grainRamp(height, rand, METAL_TONE.grain);
  const reflection = grainRamp(
    Math.max(2, Math.round(width / 24)),
    rand,
    METAL_TONE.reflection,
  );
  const lut = toneLut(base, warm);
  const lutScale = (TONE_LUT_SIZE - 1) / (TONE_LUT_MAX - TONE_LUT_MIN);

  const img = ctx.createImageData(width, height);
  const data = img.data;
  for (let y = 0; y < height; y++) {
    const rowFactor = across[y] * grain[y];
    for (let x = 0; x < width; x++) {
      const factor =
        rowFactor *
        along[x] *
        reflection[Math.floor((x / width) * reflection.length) % reflection.length];
      const slot = Math.max(
        0,
        Math.min(
          TONE_LUT_SIZE - 1,
          Math.round((factor - TONE_LUT_MIN) * lutScale),
        ),
      );
      const i = (y * width + x) * 4;
      data[i] = lut[slot * 3];
      data[i + 1] = lut[slot * 3 + 1];
      data[i + 2] = lut[slot * 3 + 2];
      data[i + 3] = 255;
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
    fillGavelMetalSurface(ctx, width, height, bandHex);
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

/**
 * Plate copy is set as a hierarchy rather than at one size: a large headline
 * with a smaller line beneath it, the way the engraved plaques read. Sizes are
 * fractions of the plate height instead of the band's presets, so the type
 * fills the plaque rather than the band's much shorter canvas.
 */
const STAND_PLATE_HEADLINE_FONT_FRACTION = 0.3;
const STAND_PLATE_SOLO_FONT_FRACTION = 0.36;
const STAND_PLATE_SUBTITLE_FONT_RATIO = 0.5;
const STAND_PLATE_LINE_GAP_RATIO = 0.16;
/** The text-size step still nudges the plate, around the tuned default. */
const STAND_PLATE_PRESET_SCALE: Record<GavelTextSizePreset, number> = {
  small: 0.88,
  medium: 1,
  large: 1.1,
};

function standPlateFontSizes(
  count: number,
  preset: GavelTextSizePreset,
): number[] {
  if (count <= 0) return [];
  const scale = STAND_PLATE_PRESET_SCALE[preset] ?? 1;
  if (count === 1) {
    return [
      STAND_PLATE_TEXTURE_H_PX * STAND_PLATE_SOLO_FONT_FRACTION * scale,
    ];
  }
  const headline =
    STAND_PLATE_TEXTURE_H_PX * STAND_PLATE_HEADLINE_FONT_FRACTION * scale;
  return [headline, headline * STAND_PLATE_SUBTITLE_FONT_RATIO];
}

/** Leading is set off the headline, so both lines stay one lockup. */
function standPlateLineGap(fontSizes: readonly number[]): number {
  return (fontSizes[0] ?? 0) * STAND_PLATE_LINE_GAP_RATIO;
}

/** Widest line and total block height of the plate text, in canvas px. */
function plateTextMetrics(
  ctx: CanvasRenderingContext2D | null,
  filled: readonly GavelBandLineInput[],
  fontSizes: readonly number[],
): { width: number; height: number } {
  if (!filled.length) return { width: 0, height: 0 };
  let width = 0;
  let height = Math.max(0, filled.length - 1) * standPlateLineGap(fontSizes);
  filled.forEach((line, index) => {
    const fontPx = fontSizes[index] ?? fontSizes[0];
    const text = (line.text ?? "").trim();
    if (ctx) {
      ctx.font = fontCss(line, fontPx);
      width = Math.max(width, ctx.measureText(text).width);
    } else {
      // Server render has no canvas to measure with; estimate so the lockup is
      // still roughly centered.
      width = Math.max(width, text.length * fontPx * 0.52);
    }
    height += fontPx;
  });
  return { width, height };
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

type StandPlateTextRow = {
  line: GavelBandLineInput;
  fontPx: number;
  baseline: number;
};

/**
 * One plan for the whole plate: the type size and baseline of each line plus
 * the logo box. The 3D texture, the flat proof, and the manufacturing SVG all
 * read this, so none of them can drift apart.
 */
function standPlateArtPlan(
  ctx: CanvasRenderingContext2D | null,
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  logo?: GavelPlateLogo | null,
): {
  rows: StandPlateTextRow[];
  layout: ReturnType<typeof standPlateArtLayout>;
} {
  const filled = activeLines(lines).slice(0, STAND_PLATE_MAX_LINES);
  const layoutFor = (metrics: { width: number; height: number }) =>
    standPlateArtLayout({
      logoAspect: logo?.aspect,
      logoScale: logo?.scale,
      logoGapScale: logo?.gapScale,
      textWidth: metrics.width,
      textHeight: metrics.height,
    });

  let fontSizes = standPlateFontSizes(filled.length, preset);
  let metrics = plateTextMetrics(ctx, filled, fontSizes);
  let layout = layoutFor(metrics);
  // Copy longer than the space the logo leaves is set smaller rather than
  // condensed into it, so the two lines keep their proportions.
  if (metrics.width > layout.textMaxWidth) {
    const shrink = layout.textMaxWidth / metrics.width;
    fontSizes = fontSizes.map((fontPx) => fontPx * shrink);
    metrics = plateTextMetrics(ctx, filled, fontSizes);
    layout = layoutFor(metrics);
  }

  const gap = standPlateLineGap(fontSizes);
  let top = (STAND_PLATE_TEXTURE_H_PX - metrics.height) / 2;
  const rows = filled.map((line, index) => {
    const fontPx = fontSizes[index] ?? fontSizes[0];
    const baseline = top + fontPx * 0.78;
    top += fontPx + gap;
    return { line, fontPx, baseline };
  });

  return { rows, layout };
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

  fillGavelMetalSurface(ctx, width, height, plateHex);

  const dark = plateHex.trim().toLowerCase() === "#ffffff" ? "#4f5359" : "#231c13";
  tracePath(ctx, standPlateKeylinePath());
  ctx.lineJoin = "round";
  ctx.strokeStyle = dark;
  ctx.lineWidth = standPlateKeylinePx();
  ctx.stroke();

  if (options?.shaped) ctx.restore();

  const { rows, layout } = standPlateArtPlan(
    ctx,
    lines,
    preset,
    options?.logo,
  );

  if (options?.logo?.image && layout.logo) {
    ctx.drawImage(
      options.logo.image,
      layout.logo.x,
      layout.logo.y,
      layout.logo.w,
      layout.logo.h,
    );
  }

  for (const row of rows) {
    ctx.font = fontCss(row.line, row.fontPx);
    ctx.fillStyle = row.line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText(
      (row.line.text ?? "").trim(),
      layout.textCenterX,
      row.baseline,
      layout.textMaxWidth,
    );
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
  const measureCtx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  const { rows, layout } = standPlateArtPlan(
    measureCtx,
    lines,
    preset,
    options?.logo,
  );
  const logoEl =
    options?.logo?.href && layout.logo
      ? `<image x="${layout.logo.x.toFixed(2)}" y="${layout.logo.y.toFixed(2)}" width="${layout.logo.w.toFixed(2)}" height="${layout.logo.h.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(options.logo.href)}"/>`
      : "";
  const textEls = rows
    .map(({ line, fontPx, baseline }) => {
      const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
      const weight = line.bold ? 700 : 600;
      const fontStyle = line.italic ? "italic" : "normal";
      const color = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
      const text = escapeXml((line.text ?? "").trim());
      return `<text x="${layout.textCenterX.toFixed(2)}" y="${baseline.toFixed(2)}" text-anchor="middle" font-family="${escapeXml(family)}, Georgia, serif" font-size="${fontPx.toFixed(2)}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(color)}">${text}</text>`;
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
    const ink = blackInkLogo(logo.image);
    const fallbackAspect =
      Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1;
    const aspect = ink ? ink.aspect : fallbackAspect;
    const maxLogoH = size * 0.34 * clampGavelLogoScale(logo.scale ?? 1);
    const logoW = Math.min(size * 0.52, maxLogoH * aspect);
    const logoH = logoW / aspect;
    const logoY = text ? size * 0.17 : (size - logoH) / 2;
    ctx.save();
    ctx.drawImage(ink?.canvas ?? logo.image, (size - logoW) / 2, logoY, logoW, logoH);
    if (!ink) {
      // Unreadable art (cross-origin): keep the alpha mask as a last resort.
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#000000";
      ctx.fillRect((size - logoW) / 2, logoY, logoW, logoH);
    }
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
  // The converted art carries the black-ink reduction in its own pixels, so
  // the SVG only needs the alpha-mask filter when the conversion is skipped.
  const ink = logo?.image ? blackInkLogoDataUrl(logo.image) : null;
  const logoHref = ink?.href ?? logo?.href ?? null;
  if (!text && !logoHref) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"></svg>`;
  }

  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d") ?? null;
  const inset = size * 0.14;
  const maxWidth = size - inset * 2;
  const hasLogo = Boolean(logoHref);
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
    ink?.aspect ??
    (logo && Number.isFinite(logo.aspect) && logo.aspect > 0 ? logo.aspect : 1);
  const maxLogoH =
    size * 0.34 * clampGavelLogoScale(logo?.scale ?? 1);
  const logoW = Math.min(size * 0.52, maxLogoH * logoAspect);
  const logoH = logoW / logoAspect;
  const logoY = text ? size * 0.17 : (size - logoH) / 2;
  const logoEl = logoHref
    ? `<image x="${((size - logoW) / 2).toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logoHref)}"${ink ? "" : ' filter="url(#black-ink-logo)"'}/>`
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
    logoHref && !ink
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
