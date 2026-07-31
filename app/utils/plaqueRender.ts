import type { BadgeImage, PlaqueDetachedPhotoFrameFinish } from "~/types/badge";
import {
  FEATURED_BRUSHED_BLACK_HEX,
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
  LEGACY_BRUSHED_GOLD_HEX,
  LEGACY_BRUSHED_SILVER_HEX,
} from "~/constants/colors";
import type { SignLogoDrawRect } from "~/utils/signLogoTextLayout";
import {
  signHorizontalInsetPx,
  signVerticalInsetPx,
} from "~/utils/signTextLayout";

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
 * Attached plaque + optional logo: graphic zone height as a fraction of inner plate height.
 * ~38% matches classic award references where the emblem dominates the upper third.
 */
export const PLAQUE_ATTACHED_LOGO_BAND_HEIGHT_FRAC = 0.38;

/**
 * Inner plate box for attached + top image: text starts below the logo band.
 * (Trim box = {@link getEffectiveDesignBox} for the plaque template.)
 */
export function plaqueAttachedTextPlateRect(trimBox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const h = trimBox.height;
  const logoH = h * PLAQUE_ATTACHED_LOGO_BAND_HEIGHT_FRAC;
  return {
    x: trimBox.x,
    y: trimBox.y + logoH,
    width: trimBox.width,
    height: h - logoH,
  };
}

/** Upper band of the inner plate — fitted logo for attached plaque (placement is always `top`). */
export function plaqueAttachedLogoBandRect(trimBox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const h = trimBox.height;
  const logoH = h * PLAQUE_ATTACHED_LOGO_BAND_HEIGHT_FRAC;
  return {
    x: trimBox.x,
    y: trimBox.y,
    width: trimBox.width,
    height: logoH,
  };
}

/**
 * Attached plaque logo: fixed height relative to the logo band (aspect ratio preserved), centered
 * horizontally, bottom-aligned in the band so engraved copy can sit directly under the graphic.
 */
export const PLAQUE_ATTACHED_LOGO_DRAW_TARGET_HEIGHT_FRAC = 0.86;

export function plaqueAttachedLogoDrawRectFixed(
  logoBand: { x: number; y: number; width: number; height: number },
  logo: BadgeImage | undefined,
): SignLogoDrawRect | null {
  if (!logo?.src?.trim()) return null;
  // Attached plaques want a larger, more “award-like” emblem with less air than sign rules.
  const padX = Math.max(6, logoBand.width * 0.06);
  const padY = Math.max(6, logoBand.height * 0.06);
  const innerW = Math.max(1, logoBand.width - 2 * padX);
  const innerH = Math.max(1, logoBand.height - 2 * padY);
  const iw =
    logo.intrinsicWidth && logo.intrinsicWidth > 0 ? logo.intrinsicWidth : 100;
  const ih =
    logo.intrinsicHeight && logo.intrinsicHeight > 0
      ? logo.intrinsicHeight
      : 100;
  const targetH = innerH * 0.94;
  let fh = targetH;
  let fw = (iw / ih) * fh;
  if (fw > innerW) {
    fw = innerW;
    fh = (ih / iw) * fw;
  }
  const x = logoBand.x + padX + (innerW - fw) / 2;
  const y = logoBand.y + logoBand.height - padY - fh;
  return { x, y, width: fw, height: fh };
}

/**
 * Classic award plaque: same fitted emblem size as {@link plaqueAttachedLogoDrawRectFixed} (upper logo band),
 * but positioned with its vertical center midway between the inner border top (or top inset) and the
 * “presented to” baseline — not grown to fill that gap.
 */
export function plaqueAttachedLogoDrawRectClassic(
  trimBox: { x: number; y: number; width: number; height: number },
  logo: BadgeImage | undefined,
  presentedToY: number,
  topInsetPx: number,
): SignLogoDrawRect | null {
  const logoBand = plaqueAttachedLogoBandRect(trimBox);
  const sized = plaqueAttachedLogoDrawRectFixed(logoBand, logo);
  if (!sized) return null;

  const { width: fw, height: fh } = sized;
  const topY = trimBox.y + topInsetPx;
  const gapBeforeCaption = Math.max(10, trimBox.height * 0.018);
  const centerY = (topY + presentedToY) / 2;
  let y = centerY - fh / 2;

  const yMin = topY + 2;
  const yMax = presentedToY - gapBeforeCaption - fh;
  if (y < yMin) y = yMin;
  if (y > yMax) y = Math.max(yMin, yMax);

  return { x: sized.x, y, width: fw, height: fh };
}

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
  const filterAttr = grainFilterId ? ` filter="url(#${grainFilterId})"` : "";
  return `<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="url(#${gradId})" stroke="none"${filterAttr}/>`;
}

/** Featured “Brushed Gold” from the picker — good default for plaque plate previews. */
export const PLAQUE_DEFAULT_BRUSH_GOLD_HEX = FEATURED_BRUSHED_GOLD_HEX;

/** Featured brushed silver plate color (badge/sign/plaque pickers). */
export const FEATURED_BRUSHED_SILVER_PLATE_HEX = FEATURED_BRUSHED_SILVER_HEX;

/**
 * True when the plate background should use the brushed-metal gradient
 * (same treatment as plaque metal), limited to featured gold/silver/black swatches.
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
    normalized === FEATURED_BRUSHED_BLACK_HEX.toUpperCase() ||
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
  if (n === FEATURED_BRUSHED_BLACK_HEX.toUpperCase()) {
    return FEATURED_BRUSHED_BLACK_HEX;
  }
  return raw;
}

function parseHexRgb(
  input: string,
): { r: number; g: number; b: number } | null {
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

/** Per-stop RGB multipliers for gradient stroke accents (photo frames, legacy CSS). */
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

function metalBrushStopColors(
  baseHex: string,
): { offset: number; color: string }[] {
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
      (stop) => `<stop offset="${stop.offset}%" stop-color="${stop.color}"/>`,
    )
    .join("\n      ");
}

/**
 * CSS swatch: flat base color (matches SVG plate fill). Brush grain is SVG-only.
 */
export function plaqueMetalBrushCssBackgroundImage(
  plateBackgroundHex: string,
): string {
  const normalized = normalizeFeaturedBrushedMetalBaseHex(plateBackgroundHex);
  const base =
    normalized ||
    (() => {
      const t = plateBackgroundHex.trim();
      return t.startsWith("#")
        ? t
        : t
        ? `#${t}`
        : PLAQUE_DEFAULT_BRUSH_GOLD_HEX;
    })();
  return base;
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

/**
 * Horizontal brush grain on a flat metal base. Clipped to the plate path so no
 * grey/silver halo outside the die; multiply keeps the original gold/silver tone.
 */
export function plaqueMetalBrushFilterDef(filterId: string): string {
  return `<filter id="${filterId}" filterUnits="objectBoundingBox" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.055 0.48" numOctaves="4" seed="31" result="fineTurb"/>
    <feColorMatrix in="fineTurb" type="saturate" values="0" result="fineGray"/>
    <feComponentTransfer in="fineGray" result="fineBrush">
      <feFuncR type="linear" slope="0.28" intercept="0.76"/>
      <feFuncG type="linear" slope="0.28" intercept="0.76"/>
      <feFuncB type="linear" slope="0.28" intercept="0.76"/>
      <feFuncA type="linear" slope="1" intercept="0"/>
    </feComponentTransfer>
    <feComposite in="fineBrush" in2="SourceGraphic" operator="in" result="fineClip"/>
    <feBlend in="SourceGraphic" in2="fineClip" mode="multiply" result="pass1"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.009 0.14" numOctaves="2" seed="83" result="macroTurb"/>
    <feColorMatrix in="macroTurb" type="saturate" values="0" result="macroGray"/>
    <feComponentTransfer in="macroGray" result="macroBrush">
      <feFuncR type="linear" slope="0.18" intercept="0.84"/>
      <feFuncG type="linear" slope="0.18" intercept="0.84"/>
      <feFuncB type="linear" slope="0.18" intercept="0.84"/>
      <feFuncA type="linear" slope="1" intercept="0"/>
    </feComponentTransfer>
    <feComposite in="macroBrush" in2="SourceGraphic" operator="in" result="macroClip"/>
    <feBlend in="pass1" in2="macroClip" mode="multiply" result="pass2"/>
    <feComposite in="pass2" in2="SourceGraphic" operator="in"/>
  </filter>`;
}

/** Solid catalog plate color before the brush filter (no banded linear gradient). */
export function applyPlaqueMetalBrushFlatFill(
  innerPathWithFill: string,
  baseHex: string,
): string {
  return innerPathWithFill.replace(
    /fill\s*=\s*["'][^"']*["']/i,
    `fill="${baseHex}"`,
  );
}

export function applyPlaqueMetalBrushFilter(
  markup: string,
  filterId: string,
): string {
  if (/\bfilter\s*=/i.test(markup)) {
    return markup.replace(
      /\bfilter\s*=\s*["'][^"']*["']/i,
      `filter="url(#${filterId})"`,
    );
  }
  return markup.replace(
    /^(<[a-zA-Z][^>]*)(\/?>)/,
    `$1 filter="url(#${filterId})"$2`,
  );
}

/**
 * Flat base color + horizontal brush filter (badge/plaque inner plate).
 * Gradient defs are omitted so banded linear stops do not show through.
 */
export function plaqueMetalBrushInnerPlateTreatment(params: {
  innerPathWithFill: string;
  filterId: string;
  baseHex: string;
}): { defsXml: string; innerPlateMarkup: string } {
  const { innerPathWithFill, filterId, baseHex } = params;
  let innerPlateMarkup = applyPlaqueMetalBrushFlatFill(
    innerPathWithFill,
    baseHex,
  );
  innerPlateMarkup = applyPlaqueMetalBrushFilter(innerPlateMarkup, filterId);
  return {
    defsXml: plaqueMetalBrushFilterDef(filterId),
    innerPlateMarkup,
  };
}

/**
 * Detached layout: wood opening shows preview stock art (real insert is supplied separately).
 * User-uploaded artwork renders on the metal plate beside text.
 */
/** Stock photo opening frame on wood: 0.25" border at template scale (96 DPI). */
const PLAQUE_DETACHED_PHOTO_BORDER_STROKE_PX = Math.round(0.25 * 96);

/**
 * Detached wood photo opening: metallic frame stroke + gradient defs (supplier sheet 0.25" frame).
 * Uses the same brush stops and vertical axis as {@link plaqueMetalBrushGradientDef} so gold/silver
 * match the brushed plate treatment (fill uses horizontal streaks; stroke samples the same gradient field).
 */
export function plaqueDetachedPhotoFrameDecor(params: {
  slot: { x: number; y: number; width: number; height: number };
  finish: PlaqueDetachedPhotoFrameFinish;
  /** Unique suffix for gradient ids (e.g. safe clip id fragment). */
  idSuffix: string;
  /** Template height in px — must match plate gradient extent so brush aligns with the metal plate. */
  templateHeightPx: number;
}): { defsSnippet: string; rectSnippet: string } {
  const { slot, finish, idSuffix, templateHeightPx } = params;
  const sw = PLAQUE_DETACHED_PHOTO_BORDER_STROKE_PX;
  const gid = `plaqueDetachedPhotoFrame${idSuffix}`;
  const x = slot.x;
  const y = slot.y;
  const w = slot.width;
  const h = slot.height;

  const extent = Math.max(1, Math.round(templateHeightPx));
  const baseHex =
    finish === "silver"
      ? normalizeFeaturedBrushedMetalBaseHex(
          FEATURED_BRUSHED_SILVER_PLATE_HEX,
        ) || FEATURED_BRUSHED_SILVER_PLATE_HEX
      : normalizeFeaturedBrushedMetalBaseHex(PLAQUE_DEFAULT_BRUSH_GOLD_HEX) ||
        PLAQUE_DEFAULT_BRUSH_GOLD_HEX;

  const stops = metalBrushStopElementsXml(baseHex);

  return {
    defsSnippet: `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${extent}">
      ${stops}
    </linearGradient>`,
    rectSnippet: `<rect x="${x}" y="${y}" width="${w}" height="${h}"
      fill="none" stroke="url(#${gid})" stroke-width="${sw}"/>`,
  };
}

/** Supplier sheet: thin engraved rule inset inside the metal text plate (photo plaques). */
export function plaqueDetachedPlateLayoutMetrics(
  plateW: number,
  plateH: number,
): {
  /** Gap from outer plate edge to inner engraving rect used for the stroke. */
  borderInsetPx: number;
  strokePx: number;
  /** Inset from outer plate to layout bounds (text + plate logo stay inside this rect). */
  layoutInsetPx: number;
} {
  const m = Math.min(plateW, plateH);
  const strokePx = Math.max(1, Math.min(2.25, m * 0.0042));
  const borderInsetPx = Math.max(6.5, m * 0.026);
  const layoutInsetPx = borderInsetPx + strokePx * 0.5 + Math.max(2, m * 0.008);
  return { borderInsetPx, strokePx, layoutInsetPx };
}

/**
 * Rectangle inside the thin inner plate border: use for text layout and plate-side logo bounds.
 * Pass the outer metal plate rect ({@link getEffectiveDesignBox} on detached templates).
 */
export function plaqueDetachedPlateContentRect(outer: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const { layoutInsetPx } = plaqueDetachedPlateLayoutMetrics(
    outer.width,
    outer.height,
  );
  const w = outer.width - 2 * layoutInsetPx;
  const h = outer.height - 2 * layoutInsetPx;
  if (w < 8 || h < 8) return outer;
  return {
    x: outer.x + layoutInsetPx,
    y: outer.y + layoutInsetPx,
    width: w,
    height: h,
  };
}

/** Thin inner frame stroke on the detached text plate (drawn inside outer plate bounds). */
export function plaqueDetachedPlateInnerBorderSvgMarkup(params: {
  plateOuter: { x: number; y: number; width: number; height: number };
  strokeHex: string;
}): string {
  const { borderInsetPx, strokePx } = plaqueDetachedPlateLayoutMetrics(
    params.plateOuter.width,
    params.plateOuter.height,
  );
  const { x, y, width, height } = params.plateOuter;
  const xi = x + borderInsetPx;
  const yi = y + borderInsetPx;
  const wi = Math.max(1, width - 2 * borderInsetPx);
  const hi = Math.max(1, height - 2 * borderInsetPx);
  const stroke = (params.strokeHex || "#151515").replace(/&/g, "&amp;");
  return `<rect x="${xi}" y="${yi}" width="${wi}" height="${hi}" fill="none" stroke="${stroke}" stroke-width="${strokePx}" vector-effect="non-scaling-stroke"/>`;
}

/**
 * Preview-only inset from supplier mockups (no wood field / metal plate).
 * Portrait/landscape supplier rasters are the full inner silver-frame openings (incl. bottom band); omit duplicate SVG banner.
 * Rendering uses `meet` so the entire inset is visible inside the wood slot (may letterbox vs template aspect).
 */
export const PLAQUE_DETACHED_PORTRAIT_STOCK_PATH =
  "/images/plaque/plaque-detached-portrait-stock.png";
export const PLAQUE_DETACHED_LANDSCAPE_STOCK_PATH =
  "/images/plaque/plaque-detached-landscape-stock.png";

export function plaqueDetachedWoodStockPhotoHref(
  templateId: string | undefined,
): string | null {
  const id = templateId ?? "";
  if (/^plaque-detached-landscape-/i.test(id))
    return PLAQUE_DETACHED_LANDSCAPE_STOCK_PATH;
  if (/^plaque-detached-portrait-/i.test(id) || /^plaque-detached$/i.test(id)) {
    return PLAQUE_DETACHED_PORTRAIT_STOCK_PATH;
  }
  return null;
}

/** Semi-transparent bar + label matching supplier mockups (stock faces ship as raster only). */
function plaqueDetachedWoodPhotoHereBannerSvg(slot: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  const { x, y, width, height } = slot;
  const bandH = Math.max(22, height * 0.2);
  const margin = Math.max(5, height * 0.028);
  const bx = x + margin;
  const by = y + height - bandH - margin;
  const bw = Math.max(1, width - 2 * margin);
  const bh = bandH;
  const fs = Math.max(11, Math.min(26, height * 0.068));
  const rx = Math.max(2, fs * 0.12);
  const ty = by + bh * 0.55;
  const tx = x + width / 2;
  return `
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${rx}" ry="${rx}"
      fill="rgba(255,255,255,0.78)" stroke="rgba(255,255,255,0.55)" stroke-width="${Math.max(
        1,
        fs * 0.05,
      )}"/>
    <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="700"
      fill="#111111" letter-spacing="0.06em">YOUR PHOTO HERE</text>`;
}

/**
 * Preview-only image slot on the metal plate where the user’s upload will sit
 * (attached: upper logo band; detached: left/right plate logo).
 */
export function plaqueAttachedImagePlaceholderRect(trimBox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const band = plaqueAttachedLogoBandRect(trimBox);
  const padX = Math.max(10, band.width * 0.08);
  const padY = Math.max(10, band.height * 0.12);
  return {
    x: band.x + padX,
    y: band.y + padY,
    width: Math.max(1, band.width - 2 * padX),
    height: Math.max(1, band.height - 2 * padY),
  };
}

export function plaqueUserImagePlaceholderSvg(params: {
  slot: { x: number; y: number; width: number; height: number };
  /** Engraved ink / contrast color on the plate. */
  inkHex: string;
  label?: string;
}): string {
  const { x, y, width, height } = params.slot;
  if (width < 8 || height < 8) return "";
  const size = Math.max(8, Math.min(width, height) * 0.9);
  const cardX = x + (width - size) / 2;
  const cardY = y + (height - size) / 2;
  const iconCx = cardX + size / 2;
  const iconCy = cardY + size * 0.38;
  const headR = size * 0.15;
  const fontSize = Math.max(9, Math.min(28, size * 0.18));
  const textX = cardX + size / 2;
  const lineHeight = fontSize;
  const textY = cardY + size / 2 - lineHeight * 0.7;
  const words = (params.label ?? "Your Image Here")
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  while (words.length < 3) words.push("");
  return `
    <rect x="${cardX + size * 0.035}" y="${cardY + size * 0.045}"
      width="${size}" height="${size}" fill="#000000" fill-opacity="0.09"/>
    <rect x="${cardX}" y="${cardY}" width="${size}" height="${size}"
      fill="#f1f1f3"/>
    <circle cx="${iconCx}" cy="${iconCy}" r="${headR}" fill="#d2d2d7"/>
    <ellipse cx="${iconCx}" cy="${cardY + size * 0.72}"
      rx="${size * 0.3}" ry="${size * 0.15}" fill="#dedee2"/>
    <text x="${textX}" y="${textY}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
      fill="#000000">
      <tspan x="${textX}" dy="0">${words[0]}</tspan>
      <tspan x="${textX}" dy="${lineHeight}">${words[1]}</tspan>
      <tspan x="${textX}" dy="${lineHeight}">${words[2]}</tspan>
    </text>`;
}

/**
 * SVG defs fragment + body group: stock photo clipped to the wood opening, optional banner, frame stroke
 * drawn on top by {@link plaqueDetachedPhotoFrameDecor}.
 */
export function plaqueDetachedWoodStockPlaceholderLayers(params: {
  clipIdPrefix: string;
  slot: { x: number; y: number; width: number; height: number };
  href: string;
  /** When false, skip {@link plaqueDetachedWoodPhotoHereBannerSvg} (portrait stock raster already includes it). */
  photoHereBanner?: boolean;
  /** Supplier inset rasters use `meet` (full inset visible); otherwise default `slice` fills the slot. */
  preserveAspectRatio?: string;
}): { defsSnippet: string; bodySnippet: string } {
  const clip = `${params.clipIdPrefix}-wood-photo`;
  const { x, y, width, height } = params.slot;
  const href = params.href;
  const photoHereBanner = params.photoHereBanner !== false;
  const preserveAspectRatio = params.preserveAspectRatio ?? "xMidYMid slice";
  const banner = photoHereBanner
    ? plaqueDetachedWoodPhotoHereBannerSvg(params.slot)
    : "";
  return {
    defsSnippet: `<clipPath id="${clip}" clipPathUnits="userSpaceOnUse">
      <rect x="${x}" y="${y}" width="${width}" height="${height}"/>
    </clipPath>`,
    bodySnippet: `<g clip-path="url(#${clip})">
      <image href="${href}" xlink:href="${href}"
        x="${x}" y="${y}" width="${width}" height="${height}"
        preserveAspectRatio="${preserveAspectRatio}"
        style="image-rendering:optimizeQuality"/>
      ${banner}
    </g>`,
  };
}

const detachedStockDataUrlPromises = new Map<string, Promise<string>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("FileReader failed"));
    fr.readAsDataURL(blob);
  });
}

async function detachedStockPublicPathToDataUrl(
  publicPath: string,
): Promise<string> {
  let p = detachedStockDataUrlPromises.get(publicPath);
  if (!p) {
    p = (async () => {
      if (typeof window === "undefined") {
        throw new Error("Stock inline requires window");
      }
      const url = `${window.location.origin}${publicPath}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return blobToDataUrl(await res.blob());
    })();
    detachedStockDataUrlPromises.set(publicPath, p);
  }
  return p;
}

/**
 * Replace detached wood stock `<image href="/images/plaque/...">` with data URLs so SVG works inside
 * blob/data-URL renders (PNG export) where relative `/images/...` would not resolve.
 */
export async function inlinePlaqueDetachedWoodStockImagesInSvg(
  svg: string,
): Promise<string> {
  if (typeof window === "undefined") return svg;

  const paths = [
    PLAQUE_DETACHED_PORTRAIT_STOCK_PATH,
    PLAQUE_DETACHED_LANDSCAPE_STOCK_PATH,
  ] as const;

  let out = svg;
  for (const publicPath of paths) {
    if (!out.includes(publicPath)) continue;
    let dataUrl: string;
    try {
      dataUrl = await detachedStockPublicPathToDataUrl(publicPath);
    } catch {
      continue;
    }
    out = out.split(`href="${publicPath}"`).join(`href="${dataUrl}"`);
    out = out
      .split(`xlink:href="${publicPath}"`)
      .join(`xlink:href="${dataUrl}"`);
  }
  return out;
}
