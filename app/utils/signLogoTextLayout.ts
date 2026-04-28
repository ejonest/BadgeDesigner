/**
 * Sign Designer: reserve an edge band for a user logo, fit bitmap with contain,
 * and shrink ResolvedSignTextLayout so sign text + syncSignBadgeLinesSizeNorm match renderSvg.
 *
 * Logo position/max size use a template-specific bounds rect: scalloped Designer plates use
 * `designBoxInnerPlate` (yellow fill) so images do not spill into the decorative trim.
 */

import type { LoadedTemplate } from "~/utils/templates";
import type { BadgeImage, BadgeLine } from "~/types/badge";
import {
  computeSignTextInkBoundsFromLaid,
  createSignTextMeasure,
  isSignLineLayoutParticipant,
  layoutSignTextLines,
  signLayoutRenderedLinesFit,
  type ResolvedSignTextLayout,
  type SignPlateCircle,
  type TextMeasurePx,
} from "~/utils/signTextLayout";
import {
  SIGN_TEXT_EXTRA_TOP_PX,
  SIGN_TEXT_INSET_PX,
  signTextOrnateExtraTopPx,
  signCircleExtraInsetPx,
  signHorizontalInsetPx,
  signTaperedNonRectExtraInsetPx,
  signTaperedOrnateOutboardNudgePx,
  signVerticalInsetPx,
} from "~/utils/signTextLayout";

/** Max fraction of plate width used for left/right logo slot (before contain fit). */
export const SIGN_LOGO_MAX_SLOT_WIDTH_FRAC = 0.35;
/**
 * Max fraction of plate height for top/bottom logo bands, and for left/right bands (same cap as
 * top/bottom so side placements do not scale to full plate height and overflow ornate edges).
 */
export const SIGN_LOGO_MAX_SLOT_HEIGHT_FRAC = 0.35;

/**
 * Fancy (`fancy-*`) plates are wide vs logo bitmap; a 0.35 width cap leaves huge empty band when
 * the logo is centered between border and text — allow a larger fit so margins look balanced.
 */
export function signLogoMaxSlotWidthFracForTemplate(
  templateId: string | undefined,
): number {
  const id = templateId?.toLowerCase() ?? "";
  if (id.startsWith("fancy-")) return 0.54;
  return SIGN_LOGO_MAX_SLOT_WIDTH_FRAC;
}

export function signLogoMaxSlotHeightFracForTemplate(
  templateId: string | undefined,
): number {
  const id = templateId?.toLowerCase() ?? "";
  if (id.startsWith("fancy-")) return 0.5;
  return SIGN_LOGO_MAX_SLOT_HEIGHT_FRAC;
}
/** Gap (px) between fitted logo and text region at 96dpi template space. */
export const SIGN_LOGO_TEXT_GAP_PX = 10;

/**
 * When border trim overlay is on: inset from inner plate, halved vs earlier pass; use same
 * `SIGN_H_INSET_FRAC` / vertical twin so combined with `signHorizontalInsetPx` the pair tracks
 * symmetric text margins in `signTextLayout`.
 */
export const SIGN_LOGO_BORDER_INSET_FRAC_X = 0.024;

/**
 * Top/bottom border inset (fraction of plate height).
 */
export const SIGN_LOGO_BORDER_INSET_FRAC_Y = 0.024;

function signLogoBorderOverlayInsetEdges(bounds: Rect): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const W = bounds.width;
  const H = bounds.height;
  return {
    left: W * SIGN_LOGO_BORDER_INSET_FRAC_X,
    right: W * SIGN_LOGO_BORDER_INSET_FRAC_X,
    top: H * SIGN_LOGO_BORDER_INSET_FRAC_Y,
    bottom: H * SIGN_LOGO_BORDER_INSET_FRAC_Y,
  };
}

function insetRectByEdges(
  r: Rect,
  e: { left: number; right: number; top: number; bottom: number },
): Rect {
  const w = r.width - e.left - e.right;
  const h = r.height - e.top - e.bottom;
  if (w < 8 || h < 8) return r;
  return {
    x: r.x + e.left,
    y: r.y + e.top,
    width: w,
    height: h,
  };
}

/**
 * Edge padding: same scale as `signHorizontalInsetPx` / `signVerticalInsetPx` on the logo box
 * so image–edge distance matches text–edge distance from `resolveSignTextLayout` for a given size.
 */
export function signLogoEdgePads(logoBoundsBox: Rect): {
  padX: number;
  padY: number;
} {
  const W = logoBoundsBox.width;
  const H = logoBoundsBox.height;
  return {
    padX: signHorizontalInsetPx(W),
    padY: signVerticalInsetPx(H),
  };
}

type Rect = { x: number; y: number; width: number; height: number };

function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = r - x;
  const height = bottom - y;
  if (width <= 0.5 || height <= 0.5) return null;
  return { x, y, width, height };
}

function pointInCircle(
  px: number,
  py: number,
  c: SignPlateCircle,
  margin: number,
): boolean {
  const m = Math.min(margin, c.r * 0.45);
  const innerR = Math.max(1, c.r - m);
  const dx = px - c.cx;
  const dy = py - c.cy;
  return dx * dx + dy * dy <= innerR * innerR;
}

/** True if axis-aligned rect (four corners) lies inside the plate circle. */
function rectInsidePlateCircle(
  rect: Rect,
  circle: SignPlateCircle,
  clearMargin: number,
): boolean {
  const pts: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  return pts.every(([x, y]) => pointInCircle(x, y, circle, clearMargin));
}

function clampPositive(n: number, min: number = 1): number {
  if (!Number.isFinite(n) || n < min) return min;
  return n;
}

function containFit(
  iw: number,
  ih: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const w = Math.max(1, iw);
  const h = Math.max(1, ih);
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: w * s, h: h * s };
}

export type SignLogoDrawRect = Rect;

/**
 * Rectangle used to size and place the user logo (often the inner yellow plate on Designer
 * templates, not the trim bounding box). Text layout still uses the effective trim design box.
 *
 * When `borderOverlayActive`, applies an additional inset so the logo stays inside the inner
 * border with a margin when framed trim is shown.
 */
export function resolveSignUserLogoBoundsBox(
  template: LoadedTemplate,
  effectiveDesignBox: Rect,
  borderOverlayActive: boolean,
): Rect {
  const inner = template.designBoxInnerPlate;
  let base: Rect;
  if (!inner || inner.width <= 0 || inner.height <= 0) {
    base = effectiveDesignBox;
  } else if (template.designerSizeKey) {
    base = inner;
  } else {
    const innerArea = inner.width * inner.height;
    const effArea = effectiveDesignBox.width * effectiveDesignBox.height;
    const tighterByArea = effArea > 0 && innerArea / effArea < 0.92;
    const tighterByDim =
      inner.width < effectiveDesignBox.width * 0.98 ||
      inner.height < effectiveDesignBox.height * 0.98;
    base = tighterByArea || tighterByDim ? inner : effectiveDesignBox;
  }

  if (!borderOverlayActive) {
    return base;
  }

  return insetRectByEdges(base, signLogoBorderOverlayInsetEdges(base));
}

/**
 * Fitted logo rectangle in template pixel space (same coords as `logoBoundsBox`), or null if no logo.
 * When plateCircle is set, shrinks the fit until the rect fits inside the circle.
 * When `taperedNonRectPlate` is set (elegant / pill / etc.), adds a plate-relative band
 * so side logos do not sit in the axis box outside the pinched die (same idea as the circle case).
 */
export function computeSignLogoDrawRect(
  logo: BadgeImage | undefined,
  logoBoundsBox: Rect,
  plateCircle: SignPlateCircle | undefined,
  signLayout?: ResolvedSignTextLayout,
): SignLogoDrawRect | null {
  if (!logo?.src?.trim()) return null;

  const iw = logo.intrinsicWidth && logo.intrinsicWidth > 0 ? logo.intrinsicWidth : 100;
  const ih = logo.intrinsicHeight && logo.intrinsicHeight > 0 ? logo.intrinsicHeight : 100;
  const placement = logo.placement ?? "left";

  const { padX: basePadX, padY: basePadY } = signLogoEdgePads(logoBoundsBox);
  const curve = plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0;
  const taper =
    !plateCircle && signLayout?.taperedNonRectPlate
      ? signTaperedNonRectExtraInsetPx(
          logoBoundsBox.width,
          logoBoundsBox.height,
          signLayout.signTemplateId,
        )
      : 0;
  const padX = basePadX + curve + taper;
  const padY = basePadY + curve + taper;
  const outLr = signTaperedOrnateOutboardNudgePx(
    logoBoundsBox.width,
    logoBoundsBox.height,
    signLayout?.signTemplateId,
    placement,
  );
  const innerW = Math.max(
    1,
    logoBoundsBox.width - 2 * padX - (placement === "left" || placement === "right" ? outLr : 0),
  );
  const innerH = Math.max(1, logoBoundsBox.height - 2 * padY);

  let maxSlotW: number;
  let maxSlotH: number;
  const wFrac = signLogoMaxSlotWidthFracForTemplate(signLayout?.signTemplateId);
  const hFrac = signLogoMaxSlotHeightFracForTemplate(signLayout?.signTemplateId);
  if (placement === "left" || placement === "right") {
    maxSlotW = innerW * wFrac;
    maxSlotH = innerH * hFrac;
  } else {
    maxSlotW = innerW;
    maxSlotH = innerH * hFrac;
  }

  let { w: fw, h: fh } = containFit(iw, ih, maxSlotW, maxSlotH);

  const db = logoBoundsBox;
  const positionRect = (w: number, h: number): SignLogoDrawRect => {
    if (placement === "left") {
      return {
        x: db.x + padX + outLr,
        y: db.y + padY + (db.height - 2 * padY - h) / 2,
        width: w,
        height: h,
      };
    }
    if (placement === "right") {
      return {
        x: db.x + db.width - padX - w - outLr,
        y: db.y + padY + (db.height - 2 * padY - h) / 2,
        width: w,
        height: h,
      };
    }
    if (placement === "top") {
      return {
        x: db.x + padX + (db.width - 2 * padX - w) / 2,
        y: db.y + padY,
        width: w,
        height: h,
      };
    }
    return {
      x: db.x + padX + (db.width - 2 * padX - w) / 2,
      y: db.y + db.height - padY - h,
      width: w,
      height: h,
    };
  };

  let rect = positionRect(fw, fh);
  if (plateCircle) {
    const clearM = signCircleExtraInsetPx(plateCircle.r);
    let g = 0;
    while (g < 40 && !rectInsidePlateCircle(rect, plateCircle, clearM)) {
      fw *= 0.92;
      fh *= 0.92;
      rect = positionRect(fw, fh);
      g++;
    }
  }

  return rect;
}

/**
 * Fit logo in the band between measured text ink and the plate edge (caps still bounded by
 * {@link SIGN_LOGO_MAX_SLOT_WIDTH_FRAC} / {@link SIGN_LOGO_MAX_SLOT_HEIGHT_FRAC} as a sanity ceiling).
 */
export function computeSignLogoDrawRectMeasured(
  ink: { left: number; right: number; top: number; bottom: number },
  logoBoundsBox: Rect,
  logo: BadgeImage,
  plateCircle: SignPlateCircle | undefined,
  signLayout: ResolvedSignTextLayout | undefined,
  placement: NonNullable<BadgeImage["placement"]> | "left",
): SignLogoDrawRect | null {
  if (!logo?.src?.trim()) return null;

  const iw =
    logo.intrinsicWidth && logo.intrinsicWidth > 0 ? logo.intrinsicWidth : 100;
  const ih =
    logo.intrinsicHeight && logo.intrinsicHeight > 0 ? logo.intrinsicHeight : 100;

  const { padX: basePadX, padY: basePadY } = signLogoEdgePads(logoBoundsBox);
  const curve = plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0;
  const taper =
    !plateCircle && signLayout?.taperedNonRectPlate
      ? signTaperedNonRectExtraInsetPx(
          logoBoundsBox.width,
          logoBoundsBox.height,
          signLayout.signTemplateId,
        )
      : 0;
  const padX = basePadX + curve + taper;
  const padY = basePadY + curve + taper;
  const outLr = signTaperedOrnateOutboardNudgePx(
    logoBoundsBox.width,
    logoBoundsBox.height,
    signLayout?.signTemplateId,
    placement,
  );
  const innerW = Math.max(
    1,
    logoBoundsBox.width -
      2 * padX -
      (placement === "left" || placement === "right" ? outLr : 0),
  );
  const innerH = Math.max(1, logoBoundsBox.height - 2 * padY);
  const db = logoBoundsBox;
  const gap = SIGN_LOGO_TEXT_GAP_PX;

  let maxSlotW: number;
  let maxSlotH: number;
  /** Full axis span from plate inset to text ink (for centering the bitmap in that band). */
  let bandWFull = 1;
  let bandHFull = 1;

  const wFracM = signLogoMaxSlotWidthFracForTemplate(signLayout?.signTemplateId);
  const hFracM = signLogoMaxSlotHeightFracForTemplate(signLayout?.signTemplateId);
  if (placement === "left") {
    const outerLeft = db.x + padX + outLr;
    bandWFull = Math.max(8, ink.left - gap - outerLeft);
    maxSlotW = Math.min(innerW * wFracM, bandWFull);
    maxSlotH = innerH * hFracM;
  } else if (placement === "right") {
    const outerRight = db.x + db.width - padX - outLr;
    bandWFull = Math.max(8, outerRight - (ink.right + gap));
    maxSlotW = Math.min(innerW * wFracM, bandWFull);
    maxSlotH = innerH * hFracM;
  } else if (placement === "top") {
    maxSlotW = innerW;
    const yMin = db.y + padY;
    bandHFull = Math.max(8, ink.top - gap - yMin);
    maxSlotH = Math.min(innerH * hFracM, bandHFull);
  } else {
    maxSlotW = innerW;
    const yMax = db.y + db.height - padY;
    bandHFull = Math.max(8, yMax - (ink.bottom + gap));
    maxSlotH = Math.min(innerH * hFracM, bandHFull);
  }

  maxSlotW = Math.max(8, maxSlotW);
  maxSlotH = Math.max(8, maxSlotH);

  let { w: fw, h: fh } = containFit(iw, ih, maxSlotW, maxSlotH);

  /** Designer plates: centering the logo in [plate … text] leaves a huge gap next to long text; hug the text edge instead (slack stays outboard). */
  const flushMeasuredLogoToText =
    signLayout?.signTemplateId?.toLowerCase().startsWith("designer-") ?? false;

  const positionRect = (w: number, h: number): SignLogoDrawRect => {
    if (placement === "left") {
      const outerLeft = db.x + padX + outLr;
      const x = flushMeasuredLogoToText
        ? outerLeft + Math.max(0, bandWFull - w)
        : outerLeft + Math.max(0, (bandWFull - w) / 2);
      return {
        x,
        y: db.y + padY + (db.height - 2 * padY - h) / 2,
        width: w,
        height: h,
      };
    }
    if (placement === "right") {
      const outerRight = db.x + db.width - padX - outLr;
      const textRightEdge = ink.right + gap;
      const x = flushMeasuredLogoToText
        ? Math.min(textRightEdge, outerRight - w)
        : textRightEdge + Math.max(0, (bandWFull - w) / 2);
      return {
        x,
        y: db.y + padY + (db.height - 2 * padY - h) / 2,
        width: w,
        height: h,
      };
    }
    if (placement === "top") {
      const yMin = db.y + padY;
      /** Same idea as left flush: hug text from above (`ink.top − gap − h`), slack stays toward plate top. */
      const y = flushMeasuredLogoToText
        ? yMin + Math.max(0, bandHFull - h)
        : yMin + Math.max(0, (bandHFull - h) / 2);
      return {
        x: db.x + padX + (db.width - 2 * padX - w) / 2,
        y,
        width: w,
        height: h,
      };
    }
    const yMax = db.y + db.height - padY;
    const textBottomEdge = ink.bottom + gap;
    /** Bottom placement: hug text from below — anchor logo top at `ink.bottom + gap`, extra space toward plate bottom. */
    const y = flushMeasuredLogoToText
      ? Math.min(textBottomEdge, yMax - h)
      : textBottomEdge + Math.max(0, (bandHFull - h) / 2);
    return {
      x: db.x + padX + (db.width - 2 * padX - w) / 2,
      y,
      width: w,
      height: h,
    };
  };

  let rect = positionRect(fw, fh);
  if (plateCircle) {
    const clearM = signCircleExtraInsetPx(plateCircle.r);
    let g = 0;
    while (g < 40 && !rectInsidePlateCircle(rect, plateCircle, clearM)) {
      fw *= 0.92;
      fh *= 0.92;
      rect = positionRect(fw, fh);
      g++;
    }
  }

  return rect;
}

/**
 * Remaining rectangle for text after reserving the logo + gap (designBox coords).
 */
function textAllowedRectAfterLogo(
  designBox: Rect,
  logoRect: SignLogoDrawRect,
  placement: NonNullable<BadgeImage["placement"]> | "left",
): Rect {
  const gap = SIGN_LOGO_TEXT_GAP_PX;
  const db = designBox;
  if (placement === "left") {
    const left = logoRect.x + logoRect.width + gap;
    return {
      x: left,
      y: db.y,
      width: Math.max(1, db.x + db.width - left),
      height: db.height,
    };
  }
  if (placement === "right") {
    return {
      x: db.x,
      y: db.y,
      width: Math.max(1, logoRect.x - gap - db.x),
      height: db.height,
    };
  }
  if (placement === "top") {
    const top = logoRect.y + logoRect.height + gap;
    return {
      x: db.x,
      y: top,
      width: db.width,
      height: Math.max(1, db.y + db.height - top),
    };
  }
  return {
    x: db.x,
    y: db.y,
    width: db.width,
    height: Math.max(1, logoRect.y - gap - db.y),
  };
}

function clampf(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * `test` is non-increasing in v over [lo,hi]: true for a prefix, then (possibly) false.
 * Returns the largest v in [lo,hi] with `test(v)` = true, or `lo` when `test(lo)` is false
 * (nothing fits; caller keeps the outboard/best-geometry position).
 * If the whole range is true, returns `hi`.
 */
function largestTrueInDecreasingTest(
  lo: number,
  hi: number,
  test: (v: number) => boolean,
): number {
  if (!test(lo)) return lo;
  if (test(hi)) return hi;
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = (a + b + 1) >> 1;
    if (test(mid)) a = mid;
    else b = mid - 1;
  }
  return a;
}

/**
 * Rebuilds clip + content from a concrete `draw` (no logo computation).
 */
function buildAdjustedLayoutForSignLogoDraw(
  baseLayout: ResolvedSignTextLayout,
  trimBoxForText: Rect,
  draw: SignLogoDrawRect,
  placement: NonNullable<BadgeImage["placement"]> | "left",
  plateCircle: SignPlateCircle | undefined,
  logoBoundsBox: Rect,
): ResolvedSignTextLayout | null {
  const allowed = textAllowedRectAfterLogo(trimBoxForText, draw, placement);
  const nextClip = intersectRects(
    {
      x: baseLayout.clipRect.x,
      y: baseLayout.clipRect.y,
      width: baseLayout.clipRect.width,
      height: baseLayout.clipRect.height,
    },
    allowed,
  );

  if (!nextClip) {
    return null;
  }

  const extraTaper =
    !plateCircle && baseLayout.taperedNonRectPlate
      ? signTaperedNonRectExtraInsetPx(
          logoBoundsBox.width,
          logoBoundsBox.height,
          baseLayout.signTemplateId,
        )
      : 0;
  const extra =
    (plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0) + extraTaper;
  const hPad = signHorizontalInsetPx(trimBoxForText.width) + extra;
  const ornateTop = signTextOrnateExtraTopPx(baseLayout.signTemplateId);
  const contentRect = {
    x: nextClip.x + hPad,
    y:
      nextClip.y +
      SIGN_TEXT_INSET_PX +
      SIGN_TEXT_EXTRA_TOP_PX +
      extra +
      ornateTop,
    width: clampPositive(nextClip.width - 2 * hPad),
    height: clampPositive(
      nextClip.height -
        2 * SIGN_TEXT_INSET_PX -
        SIGN_TEXT_EXTRA_TOP_PX -
        2 * extra -
        ornateTop,
    ),
  };

  if (contentRect.width < 8 || contentRect.height < 8) {
    return null;
  }

  return {
    ...baseLayout,
    contentRect,
    clipRect: {
      x: nextClip.x,
      y: nextClip.y,
      width: nextClip.width,
      height: nextClip.height,
    },
  };
}

/**
 * Places the logo using measured text ink + iterative clip convergence, then slides along the
 * placement axis for Word-like centering while `signLayoutRenderedLinesFit` holds.
 */
export function resolveSignTextLayoutAndUserLogoSlack(
  baseLayout: ResolvedSignTextLayout,
  trimBoxForText: Rect,
  logo: BadgeImage | undefined,
  plateCircle: SignPlateCircle | undefined,
  logoBoundsBox: Rect,
  lines: BadgeLine[] | undefined,
  measure: TextMeasurePx = createSignTextMeasure(),
): { layout: ResolvedSignTextLayout; draw: SignLogoDrawRect | null } {
  const placement = (logo?.placement ?? "left") as NonNullable<
    BadgeImage["placement"]
  >;

  const layoutForDraw = (d: SignLogoDrawRect): ResolvedSignTextLayout | null =>
    buildAdjustedLayoutForSignLogoDraw(
      baseLayout,
      trimBoxForText,
      d,
      placement,
      plateCircle,
      logoBoundsBox,
    );

  let draw0 = computeSignLogoDrawRect(
    logo,
    logoBoundsBox,
    plateCircle,
    baseLayout,
  );
  if (!draw0) {
    return { layout: baseLayout, draw: null };
  }

  const single = (): { layout: ResolvedSignTextLayout; draw: SignLogoDrawRect } => {
    const b = layoutForDraw(draw0!);
    if (!b) return { layout: baseLayout, draw: draw0! };
    return { layout: b, draw: draw0! };
  };

  if (!lines?.length || !lines.some((L) => isSignLineLayoutParticipant(L.text))) {
    return single();
  }

  let adjLayout = baseLayout;
  for (let iter = 0; iter < 4; iter++) {
    const laid = layoutSignTextLines(lines, adjLayout, measure);
    const ink = computeSignTextInkBoundsFromLaid(laid, lines, measure);
    const nextDraw = ink
      ? computeSignLogoDrawRectMeasured(
          ink,
          logoBoundsBox,
          logo!,
          plateCircle,
          baseLayout,
          placement,
        )
      : computeSignLogoDrawRect(logo, logoBoundsBox, plateCircle, baseLayout);
    if (!nextDraw) break;
    draw0 = nextDraw;
    const nextLayout = layoutForDraw(draw0);
    if (!nextLayout) break;
    const cr0 = adjLayout.contentRect;
    const cr1 = nextLayout.contentRect;
    adjLayout = nextLayout;
    if (
      Math.abs(cr0.x - cr1.x) < 0.45 &&
      Math.abs(cr0.y - cr1.y) < 0.45 &&
      Math.abs(cr0.width - cr1.width) < 0.45 &&
      Math.abs(cr0.height - cr1.height) < 0.45
    ) {
      break;
    }
  }

  const { padX: basePadX, padY: basePadY } = signLogoEdgePads(logoBoundsBox);
  const curve = plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0;
  const taper =
    !plateCircle && baseLayout.taperedNonRectPlate
      ? signTaperedNonRectExtraInsetPx(
          logoBoundsBox.width,
          logoBoundsBox.height,
          baseLayout.signTemplateId,
        )
      : 0;
  const padX = basePadX + curve + taper;
  const padY = basePadY + curve + taper;
  const outLr = signTaperedOrnateOutboardNudgePx(
    logoBoundsBox.width,
    logoBoundsBox.height,
    baseLayout?.signTemplateId,
    placement,
  );
  const db = logoBoundsBox;
  const innerW = Math.max(
    1,
    db.width - 2 * padX - (placement === "left" || placement === "right" ? outLr : 0),
  );
  const innerH = Math.max(1, db.height - 2 * padY);
  const wFracS = signLogoMaxSlotWidthFracForTemplate(baseLayout.signTemplateId);
  const hFracS = signLogoMaxSlotHeightFracForTemplate(baseLayout.signTemplateId);
  let maxSlotW: number;
  let maxSlotH: number;
  if (placement === "left" || placement === "right") {
    maxSlotW = innerW * wFracS;
    maxSlotH = innerH * hFracS;
  } else {
    maxSlotW = innerW;
    maxSlotH = innerH * hFracS;
  }

  const w = draw0.width;
  const h = draw0.height;

  const fits = (d: SignLogoDrawRect): boolean => {
    const adj = layoutForDraw(d);
    if (!adj) return false;
    return signLayoutRenderedLinesFit(lines, adj, measure);
  };

  const templateIdLower = baseLayout.signTemplateId?.toLowerCase() ?? "";
  const isDesignerFlushPlacement =
    templateIdLower.startsWith("designer-") &&
    (placement === "left" ||
      placement === "right" ||
      placement === "top" ||
      placement === "bottom");

  /**
   * Measured ink–flush `draw0` can lie **outside** the slack window (`[xOut,xIn]` or `[yOut,yIn]`)
   * because `xIn`/`yIn` use `innerW * wFrac` only, while flush uses the full trim→text band. The
   * clamp below would then move the logo toward `FitMax` ≤ slot bound and reopen a large gap. If
   * `draw0` already passes `fits`, keep it (horizontal **and** vertical placements).
   */
  if (isDesignerFlushPlacement && fits(draw0)) {
    const adj = layoutForDraw(draw0);
    return { layout: adj ?? baseLayout, draw: draw0 };
  }

  /**
   * Horizontal slack for left/right logos:
   * - **Left:** larger x → logo moves right → wider text column → `fits` is easier (monotone).
   *   We must slide the logo inbound toward `xIn` *before* relying on font shrink. The old code
   *   bailed when `fits(xOut)` failed even when `fits(xIn)` was true, pinching text at the
   *   outboard column and forcing uniform shrink toward 14px while empty plate remained.
   * - **Right:** smaller x → more room for text; check `fits(xIn)` (easiest) first, then search.
   */
  if (placement === "left") {
    const xOut = db.x + padX + outLr;
    const xIn = xOut + Math.max(0, maxSlotW - w);
    const fitsAtX = (xv: number) => fits({ ...draw0, x: xv });

    if (!fitsAtX(xIn)) {
      const adj0 = layoutForDraw({ ...draw0, x: xOut });
      return { layout: adj0 ?? baseLayout, draw: { ...draw0, x: xOut } };
    }

    let xFitMax: number;
    if (!fitsAtX(xOut)) {
      xFitMax = xIn;
    } else {
      xFitMax = largestTrueInDecreasingTest(xOut, xIn, fitsAtX);
    }

    const x = clampf(draw0.x, xOut, xFitMax);
    const draw: SignLogoDrawRect = { ...draw0, x };
    return { layout: layoutForDraw(draw) ?? baseLayout, draw };
  }

  if (placement === "right") {
    const xOut = db.x + db.width - padX - w - outLr;
    const xIn = xOut - Math.max(0, maxSlotW - w);
    const fitsAtX = (xv: number) => fits({ ...draw0, x: xv });

    if (!fitsAtX(xIn)) {
      const d: SignLogoDrawRect = { ...draw0, x: xOut };
      return { layout: layoutForDraw(d) ?? baseLayout, draw: d };
    }

    const xFitMax = largestTrueInDecreasingTest(xIn, xOut, fitsAtX);
    const x = clampf(draw0.x, xIn, xFitMax);
    const draw: SignLogoDrawRect = { ...draw0, x };
    return { layout: layoutForDraw(draw) ?? baseLayout, draw };
  }

  if (placement === "top") {
    const yOut = db.y + padY;
    const yIn = yOut + Math.max(0, maxSlotH - h);
    if (!fits({ ...draw0, y: yOut })) {
      const d: SignLogoDrawRect = { ...draw0, y: yOut };
      return { layout: layoutForDraw(d) ?? baseLayout, draw: d };
    }
    const yFitMax = largestTrueInDecreasingTest(yOut, yIn, (yv) =>
      fits({ ...draw0, y: yv }),
    );
    const y = clampf(draw0.y, yOut, yFitMax);
    const draw: SignLogoDrawRect = { ...draw0, y };
    return { layout: layoutForDraw(draw) ?? baseLayout, draw };
  }

  const yOut = db.y + db.height - padY - h;
  const yIn = yOut - Math.max(0, maxSlotH - h);
  if (!fits({ ...draw0, y: yOut })) {
    const d: SignLogoDrawRect = { ...draw0, y: yOut };
    return { layout: layoutForDraw(d) ?? baseLayout, draw: d };
  }
  const yFitMax = largestTrueInDecreasingTest(yIn, yOut, (yv) =>
    fits({ ...draw0, y: yv }),
  );
  const y = clampf(draw0.y, yIn, yFitMax);
  const drawB: SignLogoDrawRect = { ...draw0, y };
  return { layout: layoutForDraw(drawB) ?? baseLayout, draw: drawB };
}

/**
 * Shrinks sign text layout clip/content rects so text does not overlap the user logo.
 * Returns a shallow copy; `designBoxHeight` and line weight arrays are preserved for sizeNorm.
 *
 * @param trimBoxForText - Effective design box used for sign text (same as template sign layout).
 * @param logoBoundsBox - Tighter box for sizing/placing the bitmap (e.g. inner plate on Designer).
 */
export function adjustResolvedSignTextLayoutForSignLogo(
  layout: ResolvedSignTextLayout,
  trimBoxForText: Rect,
  logo: BadgeImage | undefined,
  plateCircle: SignPlateCircle | undefined,
  logoBoundsBox: Rect,
  linesForSlack?: BadgeLine[],
  measure: TextMeasurePx = createSignTextMeasure(),
): ResolvedSignTextLayout {
  const { layout: out } = resolveSignTextLayoutAndUserLogoSlack(
    layout,
    trimBoxForText,
    logo,
    plateCircle,
    logoBoundsBox,
    linesForSlack,
    measure,
  );
  return out;
}
