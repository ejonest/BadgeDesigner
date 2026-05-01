/**
 * Sign text layout: per-template content region, per-line max widths,
 * measured vertical stacks, and uniform scale when needed. Used by renderSvg and BadgeDesigner.
 */

import type { BadgeLine } from "~/types/badge";

/** No characters — excluded from layout stack and rendering. */
export function isSignLineStrictEmpty(text: string | undefined): boolean {
  return !text || text.length === 0;
}

/**
 * Spaces/tabs/newlines only (`trim().length === 0` but `length > 0`): spacer line for vertical rhythm.
 */
export function isSignLineWhitespaceOnly(text: string | undefined): boolean {
  if (!text || text.length === 0) return false;
  return text.trim() === "";
}

/** Participates in vertical stacking and font refit (non–strict-empty). */
export function isSignLineLayoutParticipant(text: string | undefined): boolean {
  return !isSignLineStrictEmpty(text);
}

/** Measure canvas text for layout; strict-empty uses empty string (zero contribution elsewhere). */
export function signLineMeasureText(text: string | undefined): string {
  if (isSignLineStrictEmpty(text)) return "";
  return text ?? "";
}

const DPI = 96;
export const SIGN_TEXT_INSET_PX = 0.1 * DPI;
export const SIGN_TEXT_EXTRA_TOP_PX = 4;

/** Pushes the first line of text down vs the pinched/curved top of ornate dies (vintage, western, designer, …). */
const SIGN_TEXT_ORNATE_CURVE_TOP_PX = 10;

/**
 * Symmetric left/right text margin: fraction of the clip (trim) width. Same basis as
 * `signHorizontalInsetPx` in signLogoTextLayout so text–border gaps match image–border gaps.
 */
export const SIGN_H_INSET_FRAC = 0.019;

/**
 * Min horizontal text/logo inset (px) so very small signs stay readable.
 */
const SIGN_H_INSET_MIN_PX = 4;

export function signHorizontalInsetPx(clipOrDesignWidth: number): number {
  if (!Number.isFinite(clipOrDesignWidth) || clipOrDesignWidth < 1) {
    return SIGN_H_INSET_MIN_PX;
  }
  return Math.max(SIGN_H_INSET_MIN_PX, clipOrDesignWidth * SIGN_H_INSET_FRAC);
}

/** Same fraction as horizontal, applied to height for top/bottom logo and vertical breathing room. */
export function signVerticalInsetPx(clipOrDesignHeight: number): number {
  if (!Number.isFinite(clipOrDesignHeight) || clipOrDesignHeight < 1) {
    return SIGN_H_INSET_MIN_PX;
  }
  return Math.max(SIGN_H_INSET_MIN_PX, clipOrDesignHeight * SIGN_H_INSET_FRAC);
}

/**
 * Extra clear band on `circle-*` sign plates. Axis-aligned margins alone leave corners of
 * rectangular art tight on the disc; this scales with radius so the curve has comfortable air.
 */
export const SIGN_CIRCLE_INSET_FRAC = 0.055;

export function signCircleExtraInsetPx(r: number): number {
  if (!Number.isFinite(r) || r < 1) return 0;
  return Math.max(3, r * SIGN_CIRCLE_INSET_FRAC);
}

/** Default: generic tapered dies (pill, notched, arrow, …) */
const SIGN_TAPERED_LOGO_INSET_FRAC = 0.046;
/** Tighter pinched sides (Victorian / elegant families) need more band vs axis box */
const SIGN_TAPERED_LOGO_INSET_FRAC_ORNATE = 0.068;

/**
 * Extra clear band for non-rect sign plates: an axis-aligned logo box can sit outside the
 * true die at the sides (e.g. pointed “elegant” tips). Pairs with `taperedNonRectPlate` +
 * the circle extra inset, which handles round plates.
 */
export function signTaperedNonRectExtraInsetPx(
  clipW: number,
  clipH: number,
  signTemplateId: string | undefined,
): number {
  if (
    !Number.isFinite(clipW) ||
    !Number.isFinite(clipH) ||
    clipW < 1 ||
    clipH < 1
  ) {
    return 0;
  }
  const m = Math.min(clipW, clipH);
  const id = signTemplateId?.toLowerCase() ?? "";
  const ornate =
    id.startsWith("victorian-") ||
    id.startsWith("frontier-elegant-") ||
    id.startsWith("western-elegant-") ||
    id.startsWith("vintage-");
  let frac = ornate
    ? SIGN_TAPERED_LOGO_INSET_FRAC_ORNATE
    : SIGN_TAPERED_LOGO_INSET_FRAC;
  const maxDim = Math.max(clipW, clipH);
  if (maxDim > 520) {
    const u = Math.min(1, (maxDim - 520) / 700);
    frac *= 1 + 0.28 * u;
  }
  if (maxDim > 2000) {
    const u2 = Math.min(1, (maxDim - 2000) / 9500);
    frac *= 1 + 0.2 * u2;
  }
  return Math.max(4, m * frac);
}

function isOrnateElegantSignId(id: string | undefined): boolean {
  const s = id?.toLowerCase() ?? "";
  return (
    s.startsWith("victorian-") ||
    s.startsWith("frontier-elegant-") ||
    s.startsWith("western-elegant-") ||
    s.startsWith("vintage-")
  );
}

/** Western / vintage wing plates: the layout AABB is “visual median”-like vs. the die shoulders. */
function isVintageWesternWingSignId(id: string | undefined): boolean {
  const s = id?.toLowerCase() ?? "";
  return s.startsWith("vintage-") || s.startsWith("western-elegant-");
}

/** Widen the text column toward the right shoulder (clip-width fraction) when the JSON omits a value. */
const WING_PLATE_DEFAULT_RIGHT_INSET_RELAX_FRAC = 0.042;
/** Slightly eases the top/bottom taper penalty on wing plates. */
const WING_PLATE_DEFAULT_TAPERED_LINE_WIDTH_MUL = 1.1;
/** Slightly looser “barrel” (ellipse) vs the 0.88 AABB for vintage/western. */
const WING_PLATE_BARREL_SEMI_AXIS_FRAC = 0.91;
const BARREL_ORNATE_BASE_SEMI_AXIS_FRAC = 0.88;

/**
 * Extra inset on the **outboard** side only (left for `left`, right for `right` placement).
 * The symmetric `signTaperedNonRectExtraInsetPx` still leaves a baroque tip too far left on
 * wide "elegant" dies; this nudges the fitted logo away from the point without shrinking top/bottom
 * slots as much as raising symmetric padding alone.
 */
export function signTaperedOrnateOutboardNudgePx(
  clipW: number,
  clipH: number,
  signTemplateId: string | undefined,
  placement: "left" | "right" | "top" | "bottom" | string,
): number {
  if (placement !== "left" && placement !== "right") return 0;
  if (!isOrnateElegantSignId(signTemplateId)) return 0;
  if (
    !Number.isFinite(clipW) ||
    !Number.isFinite(clipH) ||
    clipW < 1 ||
    clipH < 1
  ) {
    return 0;
  }
  const m = Math.min(clipW, clipH);
  const maxD = Math.max(clipW, clipH);
  // Base: ~2.4% of short side, scales up on xlarge viewBoxes
  let n = m * 0.024;
  n += m * 0.02 * Math.min(1, Math.max(0, (maxD - 700) / 10_200));
  n += m * 0.012 * Math.min(1, Math.max(0, (maxD - 3500) / 8000));
  return Math.max(0, n);
}

/** Minimum sign text font size (px). Layout and editor share this floor (Word-like nominal 14 at reference scale). */
export const SIGN_TEXT_MIN_FONT_PX = 14;

/** Optional JSON on sign template configs */
export type SignTextLayoutRegionConfig = {
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};

export type SignTextLayoutConfigJson = {
  region?: SignTextLayoutRegionConfig;
  lineWeights?: number[];
  maxWidthFraction?: number | number[];
  /**
   * Relax the **right** text inset only (as a fraction of clip width), widening `contentRect`.
   * The AABB is often tighter than the visible wing/shoulder; use 0.03–0.06. Omit for per-family
   * defaults (vintage / western-elegant).
   */
  rightInsetRelaxFrac?: number;
  /**
   * Multiplier on `taperedLineWidthScale` for `taperedNonRectPlate`. >1 = wider lines. Omit to use
   * template-family default (1 for most signs; >1 for vintage / western-elegant).
   */
  taperedLineWidthScaleMul?: number;
};

/** Circle in template pixel space (same coords as designBox / contentRect). */
export type SignPlateCircle = { cx: number; cy: number; r: number };

/** Resolved at load time from designBox + optional JSON */
export type ResolvedSignTextLayout = {
  /** Inset-applied area where text is measured and positioned */
  contentRect: { x: number; y: number; width: number; height: number };
  /** Outer region (for clip-path); matches template region before inner insets */
  clipRect: { x: number; y: number; width: number; height: number };
  /** At least 6 entries; use first n for n lines */
  lineWeights: number[];
  /** At least 6 entries; maxWidth = contentRect.width * fraction[lineIndex] */
  maxWidthFractions: number[];
  designBoxHeight: number;
  /**
   * Round sign plates: horizontal safe width varies with Y (chord of circle).
   * Set for `circle-*` templates so layout and clipping match the visible disc.
   */
  plateCircle?: SignPlateCircle;
  /**
   * When true, the inner die is not a full rectangle (pill, designer, oval, etc.): the box
   * that bounds text is wider than the visible plate near the top/bottom, so per-line max
   * width is reduced by line index (see `taperedLineWidthScale`).
   */
  taperedNonRectPlate?: boolean;
  /** Sign template id (e.g. `victorian-4x8-medium`) for size/shape-specific width tweaks. */
  signTemplateId?: string;
  /**
   * For `taperedNonRectPlate` only: eases the per-line width taper (see `taperedLineWidthScale`);
   * typically greater than 1 for wing plates. Default 1.
   */
  taperedLineWidthScaleMul?: number;
};

/**
 * Soft upper clamp for requested font sizes (px). Actual size is limited by width, slots, and region height.
 */
export function signTextLayoutMaxFontPx(
  layout: ResolvedSignTextLayout,
): number {
  const h = layout.contentRect.height;
  const w = layout.contentRect.width;
  return Math.ceil(Math.max(h, w) * 4);
}

const MAX_SIGN_LINE_SLOTS = 6;

/**
 * Sign templates whose inner path is tighter at the top/bottom (or ends) than the
 * axis-aligned text box. `circle-*` is excluded (uses chord width). `classic-framed-*`,
 * `square-*`, `standard-*`, `basic-*`, and `fancy-*` use rectangular trim/layout boxes
 * with straight vertical sides—per-line `taperedLineWidthScale` would shrink usable width
 * and leave an unnecessary gap short of the plate edge (same class of issue as Fancy).
 */
export function isTaperedNonRectSignTemplateId(
  templateId: string | undefined,
): boolean {
  if (!templateId?.trim()) return false;
  if (/^plaque-/i.test(templateId)) return false;
  if (/^circle-/i.test(templateId)) return false;
  if (/^classic-framed-/i.test(templateId)) return false;
  if (/^square-/i.test(templateId)) return false;
  if (/^standard-/i.test(templateId)) return false;
  if (/^basic-/i.test(templateId)) return false;
  if (/^fancy-/i.test(templateId)) return false;
  return true;
}

/**
 * At line index `i` of `n` stacked lines, scale max width: narrowest at the first/last
 * lines (where rounded or angled sides cut in), widest in the middle.
 */
export function taperedLineWidthScale(
  lineIndex: number,
  numLines: number,
): number {
  if (numLines <= 0) return 0.78;
  if (numLines === 1) return 0.65;
  if (numLines === 2) {
    return lineIndex === 0 ? 0.68 : 0.84;
  }
  const t = lineIndex / (numLines - 1);
  return 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t), 1.12);
}

/**
 * Victorian dies “step in” at the top/bottom: on larger sizes the AABB text box is loose
 * vs the white border; small sizes already match. Shrink max width slightly as plate px grows.
 */
function victorianNotchTightenFactor(
  layout: ResolvedSignTextLayout,
  lineIndex: number,
  numLines: number,
): number {
  const id = layout.signTemplateId?.toLowerCase() ?? "";
  if (!id.startsWith("victorian-")) return 1;
  const m = Math.max(layout.contentRect.width, layout.contentRect.height);
  if (m < 420) return 1;
  const u = Math.min(1, (m - 420) / 480);
  const isEdge = numLines <= 1 || lineIndex === 0 || lineIndex === numLines - 1;
  const maxDrop = isEdge ? 0.14 : 0.06;
  return 1 - maxDrop * u;
}

function clampPositive(n: number, min: number = 1): number {
  if (!Number.isFinite(n) || n < min) return min;
  return n;
}

/** SVG markup inside `<clipPath>` for sign text (circle on round plates, else rect). */
export function buildSignTextClipPathInnerMarkup(
  signLayout: ResolvedSignTextLayout | undefined,
  designBox: { x: number; y: number; width: number; height: number },
  insetPx: number,
): string {
  if (signLayout?.plateCircle) {
    const { cx, cy, r } = signLayout.plateCircle;
    const rr = Math.max(1, r - insetPx);
    return `<circle cx="${cx}" cy="${cy}" r="${rr}"/>`;
  }
  const clipR = signLayout?.clipRect;
  if (clipR) {
    return `<rect x="${clipR.x}" y="${clipR.y}" width="${clipR.width}" height="${clipR.height}"/>`;
  }
  return `<rect x="${designBox.x + insetPx}" y="${
    designBox.y + insetPx
  }" width="${designBox.width - insetPx * 2}" height="${
    designBox.height - insetPx * 2
  }"/>`;
}

function maxTextWidthForPlateAtY(
  layout: ResolvedSignTextLayout,
  anchor: string,
  y: number,
): number {
  const geom = layout.plateCircle;
  if (!geom) return Number.POSITIVE_INFINITY;
  const dy = y - geom.cy;
  if (Math.abs(dy) >= geom.r * 0.999) return 1;
  const halfChord = Math.sqrt(Math.max(0, geom.r * geom.r - dy * dy));
  const left = geom.cx - halfChord;
  const right = geom.cx + halfChord;
  const wClip = layout.clipRect?.width ?? layout.contentRect.width;
  const basePad = signHorizontalInsetPx(wClip) * 1.5;
  const pad = basePad + signCircleExtraInsetPx(geom.r);
  const cr = layout.contentRect;
  if (anchor === "middle") {
    return Math.max(1, (right - left) * 0.92 - 2 * pad);
  }
  if (anchor === "start") {
    return Math.max(1, right - cr.x - pad);
  }
  return Math.max(1, cr.x + cr.width - left - pad);
}

/**
 * Ornate dies (designer circle+wings, vintage, western, …) are wider in the middle than
 * at the top/bottom; the text region is a loose AABB. `getSignMaxWidthPxForLine` is only
 * indexed by line, not by Y, so a top line can still be too wide for the curve. This
 * returns a chord-like max width at `y` using an ellipse inscribed in `contentRect`,
 * with padding aligned to `maxTextWidthForPlateAtY` (circle) behavior.
 */
function maxTextWidthBarrelOrnateAtY(
  layout: ResolvedSignTextLayout,
  anchor: string,
  y: number,
): number {
  const cr = layout.contentRect;
  const cx = cr.x + cr.width / 2;
  const cy = cr.y + cr.height / 2;
  const semiAxisF = isVintageWesternWingSignId(layout.signTemplateId)
    ? WING_PLATE_BARREL_SEMI_AXIS_FRAC
    : BARREL_ORNATE_BASE_SEMI_AXIS_FRAC;
  const a = (cr.width / 2) * semiAxisF;
  const b = (cr.height / 2) * semiAxisF;
  const dy = y - cy;
  const wClip = layout.clipRect?.width ?? cr.width;
  const basePad = signHorizontalInsetPx(wClip) * 1.5;
  if (Math.abs(dy) >= b * 0.999) {
    return Math.max(1, 2 * a * 0.15 - 2 * basePad);
  }
  const halfChord = a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b)));
  const leftBound = cx - halfChord;
  const rightBound = cx + halfChord;
  if (anchor === "middle") {
    return Math.max(1, (rightBound - leftBound) * 0.92 - 2 * basePad);
  }
  if (anchor === "start") {
    return Math.max(1, rightBound - cr.x - basePad);
  }
  return Math.max(1, cr.x + cr.width - leftBound - basePad);
}

/** Ornate shapes where the visible plate is tighter at the top/bottom than the text AABB. */
function isBarrelTextProfileSignId(templateId: string | undefined): boolean {
  const s = templateId?.toLowerCase() ?? "";
  if (!s) return false;
  if (s.startsWith("designer-")) return true;
  if (isOrnateElegantSignId(s)) return true;
  if (s.startsWith("vintage-")) return true;
  if (s.startsWith("heritage-")) return true;
  if (s.startsWith("headstone-")) return true;
  return false;
}

/** Extra top inset so cap height clears the inner curve; must match `adjustResolvedSignTextLayoutForSignLogo`. */
export function signTextOrnateExtraTopPx(
  templateId: string | undefined,
): number {
  return isBarrelTextProfileSignId(templateId)
    ? SIGN_TEXT_ORNATE_CURVE_TOP_PX
    : 0;
}

/**
 * Build resolved layout from designBox and optional config.
 * When region is omitted, uses full designBox (same footprint as legacy text area).
 */
export function resolveSignTextLayout(
  designBox: { x: number; y: number; width: number; height: number },
  config: SignTextLayoutConfigJson | undefined,
  plateCircle?: SignPlateCircle,
  templateId?: string,
): ResolvedSignTextLayout {
  let regionBase = {
    x: designBox.x,
    y: designBox.y,
    width: designBox.width,
    height: designBox.height,
  };
  if (config?.region) {
    const r = config.region;
    regionBase = {
      x: designBox.x + r.xNorm * designBox.width,
      y: designBox.y + r.yNorm * designBox.height,
      width: r.widthNorm * designBox.width,
      height: r.heightNorm * designBox.height,
    };
  }

  const clipRect = {
    x: regionBase.x,
    y: regionBase.y,
    width: clampPositive(regionBase.width),
    height: clampPositive(regionBase.height),
  };

  const extra = plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0;
  const hPad = signHorizontalInsetPx(clipRect.width) + extra;
  const ornateTop = signTextOrnateExtraTopPx(templateId);
  const rightInsetRelaxFrac =
    config?.rightInsetRelaxFrac ??
    (isVintageWesternWingSignId(templateId)
      ? WING_PLATE_DEFAULT_RIGHT_INSET_RELAX_FRAC
      : 0);
  const rightInsetRelaxW = rightInsetRelaxFrac * clipRect.width;
  const contentRect = {
    x: clipRect.x + hPad,
    y:
      clipRect.y +
      SIGN_TEXT_INSET_PX +
      SIGN_TEXT_EXTRA_TOP_PX +
      extra +
      ornateTop,
    width: clampPositive(clipRect.width - 2 * hPad + rightInsetRelaxW),
    height: clampPositive(
      clipRect.height -
        2 * SIGN_TEXT_INSET_PX -
        SIGN_TEXT_EXTRA_TOP_PX -
        2 * extra -
        ornateTop,
    ),
  };

  const weights: number[] = [];
  if (config?.lineWeights?.length) {
    for (let i = 0; i < MAX_SIGN_LINE_SLOTS; i++) {
      weights.push(config.lineWeights[i] ?? config.lineWeights.at(-1) ?? 1);
    }
  } else {
    for (let i = 0; i < MAX_SIGN_LINE_SLOTS; i++) weights.push(1);
  }

  const fractions: number[] = [];
  const mwf = config?.maxWidthFraction;
  if (typeof mwf === "number") {
    for (let i = 0; i < MAX_SIGN_LINE_SLOTS; i++) fractions.push(mwf);
  } else if (Array.isArray(mwf) && mwf.length > 0) {
    for (let i = 0; i < MAX_SIGN_LINE_SLOTS; i++) {
      fractions.push(mwf[i] ?? mwf[Math.min(i, mwf.length - 1)] ?? 1);
    }
  } else {
    for (let i = 0; i < MAX_SIGN_LINE_SLOTS; i++) fractions.push(1);
  }

  const taperedNonRectPlate = Boolean(
    !plateCircle && templateId && isTaperedNonRectSignTemplateId(templateId),
  );

  const taperedLineWidthScaleMul = taperedNonRectPlate
    ? config?.taperedLineWidthScaleMul !== undefined
      ? config.taperedLineWidthScaleMul
      : isVintageWesternWingSignId(templateId)
      ? WING_PLATE_DEFAULT_TAPERED_LINE_WIDTH_MUL
      : 1
    : 1;

  return {
    contentRect,
    clipRect,
    lineWeights: weights,
    maxWidthFractions: fractions,
    designBoxHeight: designBox.height,
    ...(plateCircle ? { plateCircle } : {}),
    ...(taperedNonRectPlate ? { taperedNonRectPlate: true } : {}),
    ...(taperedNonRectPlate ? { taperedLineWidthScaleMul } : {}),
    ...(templateId ? { signTemplateId: templateId } : {}),
  };
}

export function getSignMaxWidthPxForLine(
  layout: ResolvedSignTextLayout | undefined,
  lineIndex: number,
  numLines: number = 1,
): number {
  if (!layout) return 0;
  const frac =
    layout.maxWidthFractions[
      Math.min(lineIndex, layout.maxWidthFractions.length - 1)
    ] ?? 1;
  let w = layout.contentRect.width * Math.min(1, Math.max(0.05, frac));
  if (layout.taperedNonRectPlate) {
    w *=
      taperedLineWidthScale(lineIndex, numLines) *
      (layout.taperedLineWidthScaleMul ?? 1);
  }
  w *= victorianNotchTightenFactor(layout, lineIndex, numLines);
  return Math.max(1, w);
}

/**
 * Max horizontal width for a line at vertical center `y`, matching `layoutSignTextLines`
 * (tapered rect + circle chord + ornate barrel caps).
 */
export function getEffectiveSignMaxWidthPxAtY(
  layout: ResolvedSignTextLayout,
  lineIndex: number,
  numLines: number,
  anchor: string,
  y: number,
): number {
  let w = getSignMaxWidthPxForLine(layout, lineIndex, numLines);
  if (layout.plateCircle) {
    w = Math.min(w, maxTextWidthForPlateAtY(layout, anchor, y));
  } else if (
    layout.taperedNonRectPlate &&
    !layout.plateCircle &&
    isBarrelTextProfileSignId(layout.signTemplateId)
  ) {
    w = Math.min(w, maxTextWidthBarrelOrnateAtY(layout, anchor, y));
  }
  return Math.max(1, w);
}

/** Gap between lines (matches legacy: fraction of design box height). */
export function signTextLineGapPx(layout: ResolvedSignTextLayout): number {
  return layout.designBoxHeight * 0.07;
}

export type TextMeasurePx = (args: {
  text: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: string;
  fontStyle: string;
}) => { width: number; height: number; ascent: number; descent: number };

/** Canvas-based metrics; matches renderSvg measureTextPx for consistent layout. */
export function measureSignTextPx(
  text: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: string,
  fontStyle: string,
): { width: number; height: number; ascent: number; descent: number } {
  if (typeof document === "undefined") {
    const t = text || " ";
    const ascent = fontSizePx * 0.8;
    const descent = fontSizePx * 0.2;
    return {
      width: t.length * fontSizePx * 0.6,
      height: ascent + descent,
      ascent,
      descent,
    };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const t = text || " ";
    const ascent = fontSizePx * 0.8;
    const descent = fontSizePx * 0.2;
    return {
      width: t.length * fontSizePx * 0.6,
      height: ascent + descent,
      ascent,
      descent,
    };
  }
  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const metrics = ctx.measureText(text || " ");
  const width = Math.max(1, metrics.width);
  const ascent =
    (metrics as TextMetrics & { actualBoundingBoxAscent?: number })
      .actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent =
    (metrics as TextMetrics & { actualBoundingBoxDescent?: number })
      .actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const height = Math.max(1, ascent + descent);
  return { width, height, ascent, descent };
}

export function createSignTextMeasure(): TextMeasurePx {
  return (args) =>
    measureSignTextPx(
      args.text,
      args.fontFamily,
      args.fontSizePx,
      args.fontWeight,
      args.fontStyle,
    );
}

export type LayoutSignTextLineResult = {
  line: BadgeLine;
  x: number;
  y: number;
  fontSize: number;
  anchor: string;
  familyRaw: string;
  familyEscaped: string;
  fontWeight: string;
  fontStyle: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * True when measured text stack fits `contentRect` height and each line's width at its Y
 * (circle chord / barrel caps). Skips strict-empty lines; gaps only between participants.
 */
export function signMeasuredStackFits(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  fontSizes: number[],
  measureLine: (
    i: number,
    fontSize: number,
  ) => {
    width: number;
    height: number;
    ascent: number;
    descent: number;
  },
  gapPx: number,
  anchors: string[],
): boolean {
  const n = lines.length;
  const { contentRect } = layout;
  const participantIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isSignLineLayoutParticipant(lines[i]?.text)) participantIdx.push(i);
  }
  if (participantIdx.length === 0) return true;

  let totalH = 0;
  for (let k = 0; k < participantIdx.length; k++) {
    const i = participantIdx[k]!;
    const m = measureLine(i, fontSizes[i]);
    totalH += m.height;
    if (k < participantIdx.length - 1) totalH += gapPx;
  }
  if (totalH > contentRect.height + 0.5) return false;

  let curY = contentRect.y + (contentRect.height - totalH) / 2;
  for (let k = 0; k < participantIdx.length; k++) {
    const i = participantIdx[k]!;
    const m = measureLine(i, fontSizes[i]);
    const yMid = curY + m.height / 2;
    const cap = getEffectiveSignMaxWidthPxAtY(
      layout,
      i,
      n,
      anchors[i] ?? "middle",
      yMid,
    );
    if (m.width > cap + 0.5) return false;
    curY += m.height;
    if (k < participantIdx.length - 1) curY += gapPx;
  }
  return true;
}

/**
 * Whether `lines`' rounded sizeNorm pixel sizes fit `layout` — same basis as editor +/- and
 * {@link syncSignBadgeLinesSizeNorm} (not {@link layoutSignTextLines} internal scaling).
 */
export function signMeasuredStackFitsForBadgeLines(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  measure: TextMeasurePx = createSignTextMeasure(),
): boolean {
  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const gapPx = signTextLineGapPx(layout);
  const anchors = lines.map((line) => {
    const alignment = line.align || "center";
    return alignment === "center"
      ? "middle"
      : alignment === "right"
      ? "end"
      : "start";
  });
  const sizes = lines.map((line, i) =>
    Math.round(clamp((line.sizeNorm ?? 0.15) * H, MIN_FONT, MAX_FONT)),
  );
  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: lines[i].fontFamily || "Inter, ui-sans-serif, system-ui",
      fontSizePx: fontSize,
      fontWeight: lines[i].bold ? "bold" : "normal",
      fontStyle: lines[i].italic ? "italic" : "normal",
    });
  };
  return signMeasuredStackFits(
    lines,
    layout,
    sizes,
    measureLine,
    gapPx,
    anchors,
  );
}

/** Why `signMeasuredStackFits` failed — drives targeted refit (avoid shrinking siblings when only one line’s width overflows). */
export type SignMeasuredStackFailure =
  | { type: "height" }
  | { type: "width"; lineIndex: number };

/**
 * Same geometry as {@link signMeasuredStackFits}: height check first, then per-line width at Y.
 * Returns the first failing constraint, or null when the stack fits.
 */
export function diagnoseSignMeasuredStackFailure(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  fontSizes: number[],
  measureLine: (
    i: number,
    fontSize: number,
  ) => {
    width: number;
    height: number;
    ascent: number;
    descent: number;
  },
  gapPx: number,
  anchors: string[],
): SignMeasuredStackFailure | null {
  const n = lines.length;
  const { contentRect } = layout;
  const participantIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isSignLineLayoutParticipant(lines[i]?.text)) participantIdx.push(i);
  }
  if (participantIdx.length === 0) return null;

  let totalH = 0;
  for (let k = 0; k < participantIdx.length; k++) {
    const i = participantIdx[k]!;
    const m = measureLine(i, fontSizes[i]);
    totalH += m.height;
    if (k < participantIdx.length - 1) totalH += gapPx;
  }
  if (totalH > contentRect.height + 0.5) return { type: "height" };

  let curY = contentRect.y + (contentRect.height - totalH) / 2;
  for (let k = 0; k < participantIdx.length; k++) {
    const i = participantIdx[k]!;
    const m = measureLine(i, fontSizes[i]);
    const yMid = curY + m.height / 2;
    const cap = getEffectiveSignMaxWidthPxAtY(
      layout,
      i,
      n,
      anchors[i] ?? "middle",
      yMid,
    );
    if (m.width > cap + 0.5) return { type: "width", lineIndex: i };
    curY += m.height;
    if (k < participantIdx.length - 1) curY += gapPx;
  }
  return null;
}

/**
 * After resetting one line’s typography + nominal sizeNorm, refit **only** that line’s px size.
 * Other lines keep their current rendered size (rounded from sizeNorm); no uniform shrink of siblings.
 */
export function syncSignBadgeLinesSizeNormAfterLineReset(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  resetIndex: number,
  measure: TextMeasurePx = createSignTextMeasure(),
): BadgeLine[] {
  if (lines.length === 0) return lines;
  const n = lines.length;
  if (resetIndex < 0 || resetIndex >= n)
    return syncSignBadgeLinesSizeNorm(lines, layout, measure);

  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const H = layout.designBoxHeight;
  const gapPx = signTextLineGapPx(layout);

  const lineMeta = lines.map((line, i) => {
    const alignment = line.align || "center";
    const anchor =
      alignment === "center"
        ? "middle"
        : alignment === "right"
        ? "end"
        : "start";
    const familyRaw = line.fontFamily || "Inter, ui-sans-serif, system-ui";
    const fontWeight = line.bold ? "bold" : "normal";
    const fontStyle = line.italic ? "italic" : "normal";
    const baseSize = line.sizeNorm
      ? Math.round(line.sizeNorm * H)
      : Math.round(H * (i === 0 ? 0.23 : 0.17));
    const requestedSize = clamp(baseSize, MIN_FONT, MAX_FONT);
    return { line, anchor, familyRaw, fontWeight, fontStyle, requestedSize };
  });

  const anchors = lineMeta.map((m) => m.anchor);

  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: lineMeta[i].familyRaw,
      fontSizePx: fontSize,
      fontWeight: lineMeta[i].fontWeight,
      fontStyle: lineMeta[i].fontStyle,
    });
  };

  const frozenFs = lines.map((line, i) => {
    if (i === resetIndex) return -1;
    return Math.round(clamp((line.sizeNorm ?? 0.15) * H, MIN_FONT, MAX_FONT));
  });

  const nominalResetPx = lineMeta[resetIndex].requestedSize;

  const sizesWithReset = (resetPx: number): number[] =>
    frozenFs.map((f, i) => (i === resetIndex ? resetPx : f));

  const fits = (resetPx: number) =>
    signMeasuredStackFits(
      lines,
      layout,
      sizesWithReset(resetPx),
      measureLine,
      gapPx,
      anchors,
    );

  let lo = MIN_FONT;
  let hi = nominalResetPx;
  let best = MIN_FONT;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const finalFs = sizesWithReset(best);
  return lines.map((line, i) => ({
    ...line,
    sizeNorm: finalFs[i] / H,
  }));
}

function participantIndices(lines: BadgeLine[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSignLineLayoutParticipant(lines[i]?.text)) idx.push(i);
  }
  return idx;
}

/** Per participant: sum heights + gaps; ignores strict-empty lines. */
function stackTotalHeightForSizes(
  lines: BadgeLine[],
  participantIdx: number[],
  fontSizes: number[],
  measureLine: (i: number, fs: number) => { width: number; height: number },
  gapPx: number,
): number {
  let totalH = 0;
  for (let k = 0; k < participantIdx.length; k++) {
    const i = participantIdx[k]!;
    totalH += measureLine(i, fontSizes[i]).height;
    if (k < participantIdx.length - 1) totalH += gapPx;
  }
  return totalH;
}

/**
 * Lay out sign lines inside `layout.contentRect` with per-line max width (geometry) and
 * measured vertical stacking (no fixed slots).
 */
export function layoutSignTextLines(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  measure: TextMeasurePx,
  escForSvg: (s: string) => string = escAttr,
): LayoutSignTextLineResult[] {
  if (lines.length === 0) return [];

  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const n = lines.length;
  const gapPx = signTextLineGapPx(layout);
  const { contentRect } = layout;

  const maxWidths = lines.map((_, i) => getSignMaxWidthPxForLine(layout, i, n));

  const lineMeta = lines.map((line, i) => {
    const alignment = line.align || "center";
    const anchor =
      alignment === "center"
        ? "middle"
        : alignment === "right"
        ? "end"
        : "start";
    const familyRaw = line.fontFamily || "Inter, ui-sans-serif, system-ui";
    const fontWeight = line.bold ? "bold" : "normal";
    const fontStyle = line.italic ? "italic" : "normal";
    const baseSize = line.sizeNorm
      ? Math.round(line.sizeNorm * layout.designBoxHeight)
      : Math.round(layout.designBoxHeight * (i === 0 ? 0.23 : 0.17));
    const requestedSize = clamp(baseSize, MIN_FONT, MAX_FONT);
    return { line, anchor, familyRaw, fontWeight, fontStyle, requestedSize };
  });

  const anchors = lineMeta.map((m) => m.anchor);

  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: lineMeta[i].familyRaw,
      fontSizePx: fontSize,
      fontWeight: lineMeta[i].fontWeight,
      fontStyle: lineMeta[i].fontStyle,
    });
  };

  const directSizes = lineMeta.map((meta) => meta.requestedSize);
  let finalSizes: number[] = directSizes;

  const pIdx = participantIndices(lines);

  if (
    pIdx.length > 0 &&
    !signMeasuredStackFits(
      lines,
      layout,
      directSizes,
      measureLine,
      gapPx,
      anchors,
    )
  ) {
    let uniformScale = 1;
    const MAX_ITERS = 48;
    const SHRINK = 0.97;

    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const sizes = lineMeta.map((meta, i) =>
        isSignLineLayoutParticipant(lines[i]?.text)
          ? Math.round(
              clamp(meta.requestedSize * uniformScale, MIN_FONT, MAX_FONT),
            )
          : Math.round(clamp(meta.requestedSize, MIN_FONT, MAX_FONT)),
      );
      if (
        signMeasuredStackFits(lines, layout, sizes, measureLine, gapPx, anchors)
      ) {
        finalSizes = sizes;
        break;
      }
      uniformScale *= SHRINK;
    }

    for (let pass = 0; pass < 16; pass++) {
      let narrowest = 1;
      for (const i of pIdx) {
        const fs = Math.round(
          clamp(lineMeta[i].requestedSize * uniformScale, MIN_FONT, MAX_FONT),
        );
        const w = measureLine(i, fs).width;
        if (w > maxWidths[i]! + 0.5) {
          narrowest = Math.min(narrowest, maxWidths[i]! / w);
        }
      }
      if (narrowest >= 0.999) break;
      uniformScale *= narrowest;
    }

    let scaleForFinal = uniformScale;
    for (let guard = 0; guard < 36; guard++) {
      finalSizes = lineMeta.map((meta, i) =>
        isSignLineLayoutParticipant(lines[i]?.text)
          ? Math.round(
              clamp(meta.requestedSize * scaleForFinal, MIN_FONT, MAX_FONT),
            )
          : Math.round(clamp(meta.requestedSize, MIN_FONT, MAX_FONT)),
      );
      if (
        signMeasuredStackFits(
          lines,
          layout,
          finalSizes,
          measureLine,
          gapPx,
          anchors,
        )
      ) {
        break;
      }
      scaleForFinal *= 0.98;
    }
  }

  if (
    layout.taperedNonRectPlate &&
    !layout.plateCircle &&
    isBarrelTextProfileSignId(layout.signTemplateId)
  ) {
    for (let iter = 0; iter < 14; iter++) {
      const probe = finalSizes.map((fs, i) => measureLine(i, fs));
      const totalH = stackTotalHeightForSizes(
        lines,
        pIdx,
        finalSizes,
        measureLine,
        gapPx,
      );
      let curY = contentRect.y + (contentRect.height - totalH) / 2;
      let minScale = 1;
      for (let ki = 0; ki < pIdx.length; ki++) {
        const i = pIdx[ki]!;
        const yMid = curY + probe[i].height / 2;
        const barrel = maxTextWidthBarrelOrnateAtY(
          layout,
          lineMeta[i].anchor,
          yMid,
        );
        const base = getSignMaxWidthPxForLine(layout, i, n);
        const cap = Math.min(base, barrel);
        const w = probe[i].width;
        if (w > cap + 0.5) minScale = Math.min(minScale, cap / w);
        curY += probe[i].height;
        if (ki < pIdx.length - 1) curY += gapPx;
      }
      if (minScale >= 0.997) break;
      finalSizes = finalSizes.map((fs, i) =>
        isSignLineLayoutParticipant(lines[i]?.text)
          ? Math.max(MIN_FONT, Math.floor(fs * minScale))
          : fs,
      );
    }
  }

  if (layout.plateCircle) {
    for (let iter = 0; iter < 14; iter++) {
      const probe = finalSizes.map((fs, i) => measureLine(i, fs));
      const totalH = stackTotalHeightForSizes(
        lines,
        pIdx,
        finalSizes,
        measureLine,
        gapPx,
      );
      let curY = contentRect.y + (contentRect.height - totalH) / 2;
      let minScale = 1;
      for (let ki = 0; ki < pIdx.length; ki++) {
        const i = pIdx[ki]!;
        const yMid = curY + probe[i].height / 2;
        const cap = maxTextWidthForPlateAtY(layout, lineMeta[i].anchor, yMid);
        const w = probe[i].width;
        if (w > cap + 0.5) minScale = Math.min(minScale, cap / w);
        curY += probe[i].height;
        if (ki < pIdx.length - 1) curY += gapPx;
      }
      if (minScale >= 0.997) break;
      finalSizes = finalSizes.map((fs, i) =>
        isSignLineLayoutParticipant(lines[i]?.text)
          ? Math.max(MIN_FONT, Math.floor(fs * minScale))
          : fs,
      );
    }
  }

  const metrics = finalSizes.map((fs, i) => measureLine(i, fs));
  const totalHeight = stackTotalHeightForSizes(
    lines,
    pIdx,
    finalSizes,
    measureLine,
    gapPx,
  );
  const startY = contentRect.y + (contentRect.height - totalHeight) / 2;

  const out: LayoutSignTextLineResult[] = new Array(n);
  let currentY = startY;

  for (let i = 0; i < n; i++) {
    const meta = lineMeta[i];
    let x: number;
    if (meta.anchor === "middle") x = contentRect.x + contentRect.width / 2;
    else if (meta.anchor === "start") x = contentRect.x;
    else x = contentRect.x + contentRect.width;

    if (isSignLineStrictEmpty(lines[i]?.text)) {
      out[i] = {
        line: meta.line,
        x,
        y: contentRect.y + contentRect.height / 2,
        fontSize: Math.round(clamp(finalSizes[i], MIN_FONT, MAX_FONT)),
        anchor: meta.anchor,
        familyRaw: meta.familyRaw,
        familyEscaped: escForSvg(meta.familyRaw),
        fontWeight: meta.fontWeight,
        fontStyle: meta.fontStyle,
      };
      continue;
    }

    const m = metrics[i];
    const y = currentY + m.height / 2;
    out[i] = {
      line: meta.line,
      x,
      y,
      fontSize: finalSizes[i],
      anchor: meta.anchor,
      familyRaw: meta.familyRaw,
      familyEscaped: escForSvg(meta.familyRaw),
      fontWeight: meta.fontWeight,
      fontStyle: meta.fontStyle,
    };
    currentY += m.height;
    const nextParticipant = (() => {
      for (let j = i + 1; j < n; j++) {
        if (isSignLineLayoutParticipant(lines[j]?.text)) return j;
      }
      return -1;
    })();
    if (nextParticipant >= 0) currentY += gapPx;
  }

  return out;
}

/**
 * True when measured stack fits (circle chord, barrel caps). Used for logo placement.
 */
export function signLayoutRenderedLinesFit(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  measure: TextMeasurePx,
): boolean {
  if (
    !lines.length ||
    !lines.some((l) => isSignLineLayoutParticipant(l.text))
  ) {
    return true;
  }
  const laid = layoutSignTextLines(lines, layout, measure);
  if (!laid.length) return false;
  const gapPx = signTextLineGapPx(layout);
  const anchors = laid.map((r) => r.anchor);
  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: laid[i].familyRaw,
      fontSizePx: fontSize,
      fontWeight: laid[i].fontWeight,
      fontStyle: laid[i].fontStyle,
    });
  };
  const fontSizes = laid.map((r) => r.fontSize);
  return signMeasuredStackFits(
    lines,
    layout,
    fontSizes,
    measureLine,
    gapPx,
    anchors,
  );
}

/** Optional bounds when refitting after a single-line font size edit (see {@link refitSignLinesAfterFontEdit}). */
export type RefitSignLinesAfterFontEditOptions = {
  /**
   * When the user **increased** this line's size, refit must not shrink that line below this px
   * value (typically the pre-change rounded size). Otherwise + bumps `sizeNorm` up, refit then
   * strips px for width until the line drops below where it started (and the logo slack layout
   * makes the image grow).
   */
  editedLineFloorPx?: number;
};

/**
 * After the user changes font size on one line, decrement other lines by 1px at a time until
 * the measured stack fits (or floors hit). Reduces the edited line only when no other line can shrink.
 */
export function refitSignLinesAfterFontEdit(
  lines: BadgeLine[],
  editedIndex: number,
  layout: ResolvedSignTextLayout,
  measure: TextMeasurePx = createSignTextMeasure(),
  options?: RefitSignLinesAfterFontEditOptions,
): BadgeLine[] {
  if (lines.length === 0 || editedIndex < 0 || editedIndex >= lines.length) {
    return lines;
  }

  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const gapPx = signTextLineGapPx(layout);

  const anchors = lines.map((line) => {
    const alignment = line.align || "center";
    return alignment === "center"
      ? "middle"
      : alignment === "right"
      ? "end"
      : "start";
  });

  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: lines[i].fontFamily || "Inter, ui-sans-serif, system-ui",
      fontSizePx: fontSize,
      fontWeight: lines[i].bold ? "bold" : "normal",
      fontStyle: lines[i].italic ? "italic" : "normal",
    });
  };

  const sizes = lines.map((line, i) =>
    Math.round(clamp((line.sizeNorm ?? 0.15) * H, MIN_FONT, MAX_FONT)),
  );

  const otherParticipant = (i: number) =>
    i !== editedIndex && isSignLineLayoutParticipant(lines[i]?.text);

  const editedFloor =
    options?.editedLineFloorPx !== undefined
      ? Math.round(
          clamp(options.editedLineFloorPx, MIN_FONT, MAX_FONT),
        )
      : undefined;

  const fits = () =>
    signMeasuredStackFits(lines, layout, sizes, measureLine, gapPx, anchors);

  let guard = 0;
  while (!fits() && guard < 500000) {
    guard++;
    const failure = diagnoseSignMeasuredStackFailure(
      lines,
      layout,
      sizes,
      measureLine,
      gapPx,
      anchors,
    );
    // Width overflow on line K: only shrinking line K helps (siblings don’t change caps on line K).
    if (failure?.type === "width") {
      const i = failure.lineIndex;
      const floorForLine =
        i === editedIndex && editedFloor !== undefined ? editedFloor : MIN_FONT;
      if (sizes[i] <= floorForLine) break;
      sizes[i]--;
      continue;
    }

    const othersShrinkable = sizes
      .map((s, i) => i)
      .filter((i) => otherParticipant(i) && sizes[i] > MIN_FONT);
    if (othersShrinkable.length > 0) {
      for (const i of othersShrinkable) sizes[i]--;
    } else {
      if (sizes[editedIndex] <= MIN_FONT) break;
      if (
        editedFloor !== undefined &&
        sizes[editedIndex] <= editedFloor
      ) {
        break;
      }
      sizes[editedIndex]--;
    }
  }

  return lines.map((line, i) => ({
    ...line,
    sizeNorm: sizes[i] / H,
  }));
}

export type ShrinkSignBadgeLinesOnePxParticipantOrder =
  | "highLineIndexFirst"
  | "lowLineIndexFirst";

/**
 * Decrease font by 1px on one participant line still above {@link SIGN_TEXT_MIN_FONT_PX}.
 * Default order matches {@link syncSignBadgeLinesSizeNorm} height failures (highest line index first).
 * Logo negotiation uses {@link lowLineIndexFirst} so upper lines are reduced before lower lines (e.g. line 1 before line 2).
 */
export function shrinkSignBadgeLinesOnePx(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  participantOrder: ShrinkSignBadgeLinesOnePxParticipantOrder = "highLineIndexFirst",
): BadgeLine[] | null {
  if (lines.length === 0) return null;

  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const sizes = lines.map((line, i) =>
    Math.round(clamp((line.sizeNorm ?? 0.15) * H, MIN_FONT, MAX_FONT)),
  );

  const participants: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSignLineLayoutParticipant(lines[i]?.text)) participants.push(i);
  }
  if (participantOrder === "lowLineIndexFirst") {
    participants.sort((a, b) => a - b);
  } else {
    participants.sort((a, b) => b - a);
  }

  let shrunk = false;
  for (const i of participants) {
    if (sizes[i] > MIN_FONT) {
      sizes[i]--;
      shrunk = true;
      break;
    }
  }
  if (!shrunk) return null;

  return lines.map((line, i) => ({
    ...line,
    sizeNorm: sizes[i] / H,
  }));
}

/** Union ink bounds for participant lines from laid-out sign text (template px space). */
export function computeSignTextInkBoundsFromLaid(
  laid: LayoutSignTextLineResult[],
  lines: BadgeLine[],
  measure: TextMeasurePx,
): { left: number; right: number; top: number; bottom: number } | null {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let any = false;

  for (let i = 0; i < laid.length; i++) {
    if (!isSignLineLayoutParticipant(lines[i]?.text)) continue;
    const row = laid[i];
    if (!row) continue;
    const m = measure({
      text: signLineMeasureText(lines[i]?.text),
      fontFamily: row.familyRaw,
      fontSizePx: row.fontSize,
      fontWeight: row.fontWeight,
      fontStyle: row.fontStyle,
    });
    const { x, y } = row;
    let l: number;
    let r: number;
    if (row.anchor === "middle") {
      l = x - m.width / 2;
      r = x + m.width / 2;
    } else if (row.anchor === "start") {
      l = x;
      r = x + m.width;
    } else {
      l = x - m.width;
      r = x;
    }
    const t = y - m.height / 2;
    const b = y + m.height / 2;
    left = Math.min(left, l);
    right = Math.max(right, r);
    top = Math.min(top, t);
    bottom = Math.max(bottom, b);
    any = true;
  }

  if (!any) return null;
  return { left, right, top, bottom };
}

export type SyncSignBadgeLinesSizeNormOpts = {
  /**
   * Height-overflow shrink order among participant lines. Default matches historical behavior
   * (highest line index first). Logo negotiation uses {@link lowLineIndexFirst}.
   */
  heightShrinkParticipantOrder?:
    | "highLineIndexFirst"
    | "lowLineIndexFirst";
};

/**
 * Fit stored line sizes to `layout` using **1px decrements only** (no uniform jumps from
 * {@link layoutSignTextLines}). Width failures: shrink **earlier** participant lines (lower index)
 * before the failing line so lower rows are not driven to min alone; height failures use
 * {@link SyncSignBadgeLinesSizeNormOpts.heightShrinkParticipantOrder}.
 */
export function syncSignBadgeLinesSizeNorm(
  lines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  measure: TextMeasurePx = createSignTextMeasure(),
  opts?: SyncSignBadgeLinesSizeNormOpts,
): BadgeLine[] {
  if (lines.length === 0) return lines;

  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const gapPx = signTextLineGapPx(layout);

  const anchors = lines.map((line) => {
    const alignment = line.align || "center";
    return alignment === "center"
      ? "middle"
      : alignment === "right"
      ? "end"
      : "start";
  });

  const measureLine = (i: number, fontSize: number) => {
    const raw = lines[i]?.text;
    if (isSignLineStrictEmpty(raw)) {
      return { width: 0, height: 0, ascent: 0, descent: 0 };
    }
    return measure({
      text: signLineMeasureText(raw),
      fontFamily: lines[i].fontFamily || "Inter, ui-sans-serif, system-ui",
      fontSizePx: fontSize,
      fontWeight: lines[i].bold ? "bold" : "normal",
      fontStyle: lines[i].italic ? "italic" : "normal",
    });
  };

  const sizes = lines.map((line, i) =>
    Math.round(clamp((line.sizeNorm ?? 0.15) * H, MIN_FONT, MAX_FONT)),
  );

  const fits = () =>
    signMeasuredStackFits(lines, layout, sizes, measureLine, gapPx, anchors);

  const participantsDesc: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSignLineLayoutParticipant(lines[i]?.text)) participantsDesc.push(i);
  }
  const heightOrder =
    opts?.heightShrinkParticipantOrder ?? "highLineIndexFirst";
  if (heightOrder === "lowLineIndexFirst") {
    participantsDesc.sort((a, b) => a - b);
  } else {
    participantsDesc.sort((a, b) => b - a);
  }

  const participantsAsc = [...participantsDesc].sort((a, b) => a - b);

  let guard = 0;
  while (!fits() && guard < 500000) {
    guard++;
    const failure = diagnoseSignMeasuredStackFailure(
      lines,
      layout,
      sizes,
      measureLine,
      gapPx,
      anchors,
    );
    if (failure?.type === "width") {
      const failedIdx = failure.lineIndex;
      let decremented = false;
      for (const j of participantsAsc) {
        if (j >= failedIdx) break;
        if (sizes[j] > MIN_FONT) {
          sizes[j]--;
          decremented = true;
          break;
        }
      }
      if (!decremented) {
        if (sizes[failedIdx] > MIN_FONT) {
          sizes[failedIdx]--;
        } else {
          break;
        }
      }
      continue;
    }

    let shrunk = false;
    for (const i of participantsDesc) {
      if (sizes[i] > MIN_FONT) {
        sizes[i]--;
        shrunk = true;
        break;
      }
    }
    if (!shrunk) break;
  }

  return lines.map((line, i) => ({
    ...line,
    sizeNorm: sizes[i] / H,
  }));
}
