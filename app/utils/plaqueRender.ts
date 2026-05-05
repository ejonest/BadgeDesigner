import type { BadgeImage } from "~/types/badge";
import {
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
  LEGACY_BRUSHED_GOLD_HEX,
  LEGACY_BRUSHED_SILVER_HEX,
} from "~/constants/colors";

/** @deprecated Legacy single id; migrated to `plaque-detached-portrait-*` / `plaque-detached-landscape-*`. */
export const PLAQUE_DETACHED_ID = "plaque-detached";
/** @deprecated Legacy single id; migrated to `plaque-attached-*`. */
export const PLAQUE_ATTACHED_ID = "plaque-attached";

export function isPlaqueTemplateId(id: string | undefined): boolean {
  return (id ?? "").startsWith("plaque-");
}

export function isPlaqueDetachedTemplateId(id: string | undefined): boolean {
  const s = id ?? "";
  return (
    /^plaque-detached-portrait-/i.test(s) ||
    /^plaque-detached-landscape-/i.test(s) ||
    s === PLAQUE_DETACHED_ID
  );
}

export function isPlaqueAttachedTemplateId(id: string | undefined): boolean {
  const s = id ?? "";
  return /^plaque-attached-/i.test(s) || s === PLAQUE_ATTACHED_ID;
}

/**
 * Inner plate box for attached + top image: user text is laid out in the lower 2/3 of the metal.
 * (Trim box = {@link getEffectiveDesignBox} for the plaque template.)
 */
export function plaqueAttachedTextPlateRect(trimBox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const h = trimBox.height;
  return {
    x: trimBox.x,
    y: trimBox.y + h / 3,
    width: trimBox.width,
    height: (h * 2) / 3,
  };
}

/** Upper third of the inner plate — fitted logo for attached plaque (placement is always `top`). */
export function plaqueAttachedLogoBandRect(trimBox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const h = trimBox.height;
  return {
    x: trimBox.x,
    y: trimBox.y,
    width: trimBox.width,
    height: h / 3,
  };
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function plaqueWoodGradientDef(gradId: string, widthPx: number): string {
  return `<linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${widthPx}" y2="0">
    <stop offset="0%" stop-color="#2a1510"/>
    <stop offset="22%" stop-color="#4a2a1c"/>
    <stop offset="48%" stop-color="#5c3624"/>
    <stop offset="72%" stop-color="#4e2e1f"/>
    <stop offset="100%" stop-color="#301a12"/>
  </linearGradient>`;
}

/**
 * Grain: turbulence → grayscale → multiply with base fill. Keeps brown tones; tinted turbulence reads as static.
 */
export function plaqueWoodGrainFilterDef(filterId: string): string {
  return `<filter id="${filterId}" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.085 0.014" numOctaves="3" seed="19" result="turb"/>
    <feColorMatrix in="turb" type="saturate" values="0" result="gray"/>
    <feComponentTransfer in="gray" result="grain">
      <feFuncR type="linear" slope="0.26" intercept="0.71"/>
      <feFuncG type="linear" slope="0.26" intercept="0.71"/>
      <feFuncB type="linear" slope="0.26" intercept="0.71"/>
      <feFuncA type="linear" slope="1" intercept="0"/>
    </feComponentTransfer>
    <feBlend in="SourceGraphic" in2="grain" mode="multiply"/>
  </filter>`;
}

export function plaqueWoodBackgroundRect(
  widthPx: number,
  heightPx: number,
  gradId: string,
  grainFilterId?: string,
): string {
  const filterAttr = grainFilterId
    ? ` filter="url(#${grainFilterId})"`
    : "";
  return `<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="url(#${gradId})" stroke="none"${filterAttr}/>`;
}

/** Featured “Brushed Gold” from the picker — good default for plaque plate previews. */
export const PLAQUE_DEFAULT_BRUSH_GOLD_HEX = FEATURED_BRUSHED_GOLD_HEX;

/** Featured brushed silver plate color (badge/sign/plaque pickers). */
export const FEATURED_BRUSHED_SILVER_PLATE_HEX = FEATURED_BRUSHED_SILVER_HEX;

/**
 * True when the plate background should use the brushed-metal gradient
 * (same treatment as plaque metal), limited to featured gold/silver swatches only.
 */
export function isFeaturedBrushedMetalPlateColor(
  hex: string | undefined | null,
): boolean {
  const rgb = parseHexRgb(hex ?? "");
  if (!rgb) return false;
  const normalized = rgbHex(rgb.r, rgb.g, rgb.b).toUpperCase();
  return (
    normalized === PLAQUE_DEFAULT_BRUSH_GOLD_HEX.toUpperCase() ||
    normalized === FEATURED_BRUSHED_SILVER_PLATE_HEX.toUpperCase() ||
    normalized === LEGACY_BRUSHED_GOLD_HEX.toUpperCase() ||
    normalized === LEGACY_BRUSHED_SILVER_HEX.toUpperCase()
  );
}

/** Map legacy brushed gold/silver storage hexes to current lighter catalog bases for gradients. */
export function normalizeFeaturedBrushedMetalBaseHex(
  hex: string | undefined | null,
): string {
  const s = (hex ?? "").trim();
  if (!s) return "";
  const raw = s.startsWith("#") ? s : `#${s}`;
  const n = raw.toUpperCase();
  if (
    n === LEGACY_BRUSHED_GOLD_HEX.toUpperCase() ||
    n === PLAQUE_DEFAULT_BRUSH_GOLD_HEX.toUpperCase()
  ) {
    return PLAQUE_DEFAULT_BRUSH_GOLD_HEX;
  }
  if (
    n === LEGACY_BRUSHED_SILVER_HEX.toUpperCase() ||
    n === FEATURED_BRUSHED_SILVER_PLATE_HEX.toUpperCase()
  ) {
    return FEATURED_BRUSHED_SILVER_PLATE_HEX;
  }
  return raw;
}

function parseHexRgb(input: string): { r: number; g: number; b: number } | null {
  let s = (input || "").trim();
  if (!s) return null;
  if (s[0] !== "#") s = `#${s}`;
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${clamp255(r).toString(16).padStart(2, "0")}${clamp255(g)
    .toString(16)
    .padStart(2, "0")}${clamp255(b).toString(16).padStart(2, "0")}`;
}

/** Per-stop RGB multipliers along the brush gradient axis (SVG + CSS swatches). */
const METAL_BRUSH_STREAK_MUL: readonly (readonly [number, number, number])[] = [
  [0.76, 0.78, 0.72],
  [0.92, 0.9, 0.88],
  [1.06, 1.04, 1.12],
  [0.84, 0.86, 0.8],
  [1.02, 1.0, 1.08],
  [0.88, 0.9, 0.85],
  [0.97, 0.96, 1.0],
];
const METAL_BRUSH_OFFSETS_PCT = [0, 16, 33, 50, 66, 82, 100] as const;

function metalBrushStopColors(baseHex: string): { offset: number; color: string }[] {
  const rgb =
    parseHexRgb(baseHex) ?? parseHexRgb(PLAQUE_DEFAULT_BRUSH_GOLD_HEX)!;
  const { r, g, b } = rgb;
  return METAL_BRUSH_STREAK_MUL.map((mul, i) => ({
    offset: METAL_BRUSH_OFFSETS_PCT[i]!,
    color: rgbHex(r * mul[0], g * mul[1], b * mul[2]),
  }));
}

function metalBrushStopElementsXml(baseHex: string): string {
  return metalBrushStopColors(baseHex)
    .map(
      (stop) =>
        `<stop offset="${stop.offset}%" stop-color="${stop.color}"/>`,
    )
    .join("\n      ");
}

/**
 * CSS `linear-gradient` using the same stops as {@link plaqueMetalBrushGradientDef}
 * so picker swatches match plaque/badge preview rendering.
 */
export function plaqueMetalBrushCssBackgroundImage(plateBackgroundHex: string): string {
  const normalized = normalizeFeaturedBrushedMetalBaseHex(plateBackgroundHex);
  const base =
    normalized ||
    (() => {
      const t = plateBackgroundHex.trim();
      return t.startsWith("#") ? t : t ? `#${t}` : PLAQUE_DEFAULT_BRUSH_GOLD_HEX;
    })();
  const stops = metalBrushStopColors(base);
  return `linear-gradient(180deg, ${stops
    .map((s) => `${s.color} ${s.offset}%`)
    .join(", ")})`;
}

/**
 * Multi-stop linear gradient so flat plate colors read as brushed metal.
 * Gradient runs **top → bottom** so streaks read as **horizontal** brush marks on the plate.
 * `extentPx` is template height in px (`gradientUnits="userSpaceOnUse"`).
 */
export function plaqueMetalBrushGradientDef(
  gradId: string,
  extentPx: number,
  baseHex: string,
): string {
  const stops = metalBrushStopElementsXml(baseHex);
  const h = Math.max(1, extentPx);
  return `<linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}">
      ${stops}
    </linearGradient>`;
}

/**
 * Same brush stops as {@link plaqueMetalBrushGradientDef} but in object bounding-box units.
 * Axis is vertical in bbox space so strokes read horizontal on the plate.
 */
export function plaqueMetalBrushGradientDefObjectBBox(
  gradId: string,
  baseHex: string,
): string {
  const stops = metalBrushStopElementsXml(baseHex);
  return `<linearGradient id="${gradId}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
      ${stops}
    </linearGradient>`;
}

/** Apply {@link plaqueMetalBrushGradientDef} fill to the inner plate markup from the template loader. */
export function applyPlaqueMetalBrushFill(
  innerPathWithFill: string,
  gradientRefId: string,
): string {
  return innerPathWithFill.replace(
    /fill\s*=\s*["'][^"']*["']/i,
    `fill="url(#${gradientRefId})"`,
  );
}

/** Detached layout: user photo sits in this slot on the wood, above the metal plate. */
export function computePlaqueDetachedPhotoDraw(
  logo: BadgeImage | undefined,
  slot: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  if (!logo?.src?.trim()) return null;
  const iw =
    logo.intrinsicWidth && logo.intrinsicWidth > 0 ? logo.intrinsicWidth : 100;
  const ih =
    logo.intrinsicHeight && logo.intrinsicHeight > 0
      ? logo.intrinsicHeight
      : 100;
  const pad = Math.min(slot.width, slot.height) * 0.035;
  const rw = Math.max(1, slot.width - 2 * pad);
  const rh = Math.max(1, slot.height - 2 * pad);
  const s = Math.min(rw / iw, rh / ih);
  const w = iw * s;
  const h = ih * s;
  const x = slot.x + (slot.width - w) / 2;
  const y = slot.y + (slot.height - h) / 2;
  return { x, y, width: w, height: h };
}

export function renderPlaqueDetachedPhotoImage(
  logo: BadgeImage | undefined,
  slot: { x: number; y: number; width: number; height: number },
): string {
  const r = computePlaqueDetachedPhotoDraw(logo, slot);
  if (!r || !logo?.src?.trim()) return "";
  const src = esc(logo.src);
  return `<image href="${src}" xlink:href="${src}"
    x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"
    preserveAspectRatio="xMidYMid meet"
    style="image-rendering:optimizeQuality"/>`;
}

export function plaqueDetachedPhotoFrameRect(
  slot: { x: number; y: number; width: number; height: number },
): string {
  return `<rect x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}"
    fill="none" stroke="#c0c0c0" stroke-width="4" rx="2" ry="2"/>`;
}
