/**
 * Sign Designer: reserve an edge band for a user logo, fit bitmap with contain,
 * and shrink ResolvedSignTextLayout so sign text + syncSignBadgeLinesSizeNorm match renderSvg.
 *
 * Logo position/max size use a template-specific bounds rect: scalloped Designer plates use
 * `designBoxInnerPlate` (yellow fill) so images do not spill into the decorative trim.
 */

import type { LoadedTemplate } from "~/utils/templates";
import type { BadgeImage } from "~/types/badge";
import type { ResolvedSignTextLayout, SignPlateCircle } from "~/utils/signTextLayout";
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
  if (placement === "left" || placement === "right") {
    maxSlotW = innerW * SIGN_LOGO_MAX_SLOT_WIDTH_FRAC;
    // Same vertical cap as top/bottom — do not let side logos use the full plate height
    maxSlotH = innerH * SIGN_LOGO_MAX_SLOT_HEIGHT_FRAC;
  } else {
    maxSlotW = innerW;
    maxSlotH = innerH * SIGN_LOGO_MAX_SLOT_HEIGHT_FRAC;
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
): ResolvedSignTextLayout {
  const draw = computeSignLogoDrawRect(logo, logoBoundsBox, plateCircle, layout);
  if (!draw) return layout;

  const placement = logo?.placement ?? "left";
  const allowed = textAllowedRectAfterLogo(trimBoxForText, draw, placement);

  const nextClip = intersectRects(
    {
      x: layout.clipRect.x,
      y: layout.clipRect.y,
      width: layout.clipRect.width,
      height: layout.clipRect.height,
    },
    allowed,
  );

  if (!nextClip) {
    return layout;
  }

  // Use full trim width so right margin to border matches `resolveSignTextLayout` / logo padX
  // (if we used `nextClip.width` here, the % would shrink with the post-logo column).
  const extraTaper =
    !plateCircle && layout.taperedNonRectPlate
      ? signTaperedNonRectExtraInsetPx(
          logoBoundsBox.width,
          logoBoundsBox.height,
          layout.signTemplateId,
        )
      : 0;
  const extra =
    (plateCircle ? signCircleExtraInsetPx(plateCircle.r) : 0) + extraTaper;
  const hPad = signHorizontalInsetPx(trimBoxForText.width) + extra;
  const ornateTop = signTextOrnateExtraTopPx(layout.signTemplateId);
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
    return layout;
  }

  return {
    ...layout,
    contentRect,
    clipRect: {
      x: nextClip.x,
      y: nextClip.y,
      width: nextClip.width,
      height: nextClip.height,
    },
  };
}
