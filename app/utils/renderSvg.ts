// app/utils/renderSvg.ts
import {
  buildDeskSignStandMarkup,
  deskSignInnerFillForRender,
  isDeskSignTemplateId,
} from "~/utils/deskSignRender";
import { layoutAqbPresetTextLines } from "~/utils/aqbBadgeTextSize";
import type {
  Badge,
  BadgeImage,
  BadgeLine,
  PlaqueDetachedPhotoFrameFinish,
  SignLogoLayoutSnapshot,
} from "../types/badge";
import {
  buildSignTextClipPathInnerMarkup,
  createSignTextMeasure,
  isSignLineLayoutParticipant,
  isSignLineStrictEmpty,
  layoutSignTextLines,
  measureSignTextPx,
  resolveSignTextLayout,
  signCircleExtraInsetPx,
  signHorizontalInsetPx,
  SIGN_TEXT_MIN_FONT_PX,
  shrinkSignBadgeLinesOnePx,
  signMeasuredStackFitsForBadgeLines,
  signTextLayoutMaxFontPx,
  syncSignBadgeLinesSizeNorm,
  type ResolvedSignTextLayout,
} from "~/utils/signTextLayout";
import {
  computeSignLogoDrawRect,
  resolveSignTextLayoutAndUserLogoSlack,
  resolveSignUserLogoBoundsBox,
  signLogoDrawMeetsMinDisplay,
  type ResolveSignLogoSlackOptions,
  type SignLogoDrawRect,
} from "~/utils/signLogoTextLayout";
import {
  getDesignerMotifPaths,
  isDesignerMotifId,
  type DesignerMotifId,
} from "~/data/designerMotifs";
import {
  getSignTrimOverlayFragment,
  SIGN_BORDER_OPTION_NONE,
} from "~/data/signBorderTrims";
import { loadFont } from "./fontLoader";
import { BADGE_CONSTANTS } from "../constants/badge";
import {
  getBadgeIconTextInsetPx,
  renderBadgeIconLayer,
} from "~/utils/badgeIconRender";
import {
  getPhotoPlateViewBoxSize,
  resolvePhotoTextRect,
  type ResolvedBlankBadgePhoto,
} from "~/utils/badgeBlankPhotos";
import type { DesignerVariant } from "~/constants/designerVariants";
import { resolveBadgePlatePhoto } from "~/utils/badgeCustomBackgrounds";
import { inlineBadgeBlankPhotoSrc } from "~/utils/inlineBadgePhoto";
import { signTemplateSupportsUserLogoUpload } from "~/utils/signLogoPlacement";
import {
  isFeaturedBrushedMetalPlateColor,
  normalizeFeaturedBrushedMetalBaseHex,
  PLAQUE_DEFAULT_BRUSH_GOLD_HEX,
  isPlaqueAttachedTemplateId,
  isPlaqueDetachedTemplateId,
  isPlaqueTemplateId,
  plaqueAttachedLogoBandRect,
  plaqueAttachedLogoDrawRectClassic,
  plaqueAttachedLogoDrawRectFixed,
  plaqueAttachedTextPlateRect,
  plaqueDetachedPhotoFrameDecor,
  PLAQUE_DETACHED_LANDSCAPE_STOCK_PATH,
  PLAQUE_DETACHED_PORTRAIT_STOCK_PATH,
  plaqueDetachedWoodStockPhotoHref,
  plaqueDetachedWoodStockPlaceholderLayers,
  plaqueDetachedPlateContentRect,
  plaqueDetachedPlateInnerBorderSvgMarkup,
  inlinePlaqueDetachedWoodStockImagesInSvg,
  plaqueMetalBrushInnerPlateTreatment,
  plaqueWoodBackgroundRect,
  plaqueWoodGrainFilterDef,
  plaqueWoodGradientDef,
} from "~/utils/plaqueRender";
import {
  plaqueAwardUsesClassicAttachedLogo,
  resolveAttachedPlaqueAwardFormatForRender,
} from "~/constants/plaqueFormats";
import {
  PLAQUE_CLASSIC_Y_PRESENTED_TO_FRAC,
  layoutPlaqueAwardFormat,
  plaqueAwardInkHex,
  plaqueAwardLogoTopOffsetPx,
  plaqueAwardPlateBorderSvgMarkup,
  plaqueAwardRowsToSvgMarkup,
} from "~/utils/plaqueAwardLayout";

type RenderOpts = {
  /**
   * Badge blank previews: `photo` embeds product photography + calibrated icon/text rects;
   * `vector` uses the SVG die (flat plate fill). Production exports use photo when a plate asset exists.
   * Default `photo` when a matching asset exists.
   */
  plateRenderMode?: "photo" | "vector" | "print";
  /** Dev/calibration: use in-progress rects instead of saved JSON config. */
  photoPlateOverride?: ResolvedBlankBadgePhoto;
  /**
   * When true (e.g. BadgeSvgRenderer previews, template picker), shape outline uses black (#000) so thumbnails stay visible.
   * Omit/false for exports — outline follows `badge.borderColor` / template defaults.
   */
  showOutline?: boolean;
  /** Optional outline stroke width (e.g. "3" for template picker thumbnails). Default "1.25". */
  outlineStrokeWidth?: string;
  /**
   * When true with showOutline, outline paths use vector-effect="non-scaling-stroke" so stroke stays ~constant
   * device pixels when the plate is scaled from large sign viewBoxes (Classic framed, Portrait, etc.).
   */
  outlineNonScalingStroke?: boolean;
  /**
   * Stable unique id per inline SVG instance on the page. Required when multiple previews mount together:
   * without it, duplicate clipPath/linearGradient ids make `fill="url(#…)"` resolve to the wrong SVG’s defs,
   * so solid colors work but brushed-metal gradients vanish.
   */
  svgDefScopeId?: string;
  /**
   * Redesigned badge tool: render text at exact Small/Medium/Large preset px inside the
   * calibrated photo text box (no calculateTextLayout fractional shrink).
   */
  aqbPresetTextLayout?: boolean;
};

export type { RenderOpts };

const PRODUCTION_VIEWBOX_PADDING_PX = 24;

/** Photo plate when available (embedded bg + icons); otherwise vector die — for Supabase SVG + proof PDF. */
export function resolveProductionPlateRenderMode(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): "photo" | "vector" {
  if (variant !== "badge") return "vector";
  return resolveBadgePlatePhoto(template.id, badge) ? "photo" : "vector";
}

export function resolveProductionRenderOpts(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): RenderOpts {
  const plateRenderMode = resolveProductionPlateRenderMode(
    badge,
    template,
    variant,
  );
  return {
    showOutline: false,
    plateRenderMode,
    ...(plateRenderMode === "photo" ? { aqbPresetTextLayout: true } : {}),
  };
}

/** CorelDRAW / laser print: text + icon + registration shape only — no plate fill or background art. */
export function resolvePrintRenderOpts(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): RenderOpts {
  const hasPhotoPlate =
    variant === "badge" &&
    Boolean(resolveBadgePlatePhoto(template.id, badge));
  return {
    plateRenderMode: "print",
    showOutline: true,
    ...(hasPhotoPlate ? { aqbPresetTextLayout: true } : {}),
  };
}

function isPrintPlateRender(opts: RenderOpts): boolean {
  return opts.plateRenderMode === "print";
}

function svgPhysicalDimensionAttrs(template: LoadedTemplate): string {
  const wIn = template.widthPx / 96;
  const hIn = template.heightPx / 96;
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  return `width="${fmt(wIn)}in" height="${fmt(hIn)}in"`;
}

/**
 * Die outline drawn into photo-space badgeFaceRect (same coords as proof artwork).
 */
function renderPrintDieOutlineInFaceRect(
  template: LoadedTemplate,
  face: { x: number; y: number; width: number; height: number },
  strokeWidth: string,
): string {
  const source =
    template.innerElement?.trim() || template.outlineElement?.trim() || "";
  if (!source || !(template.widthPx > 0) || !(template.heightPx > 0)) {
    return `<rect x="${face.x}" y="${face.y}" width="${face.width}" height="${face.height}" fill="none" stroke="#111111" stroke-width="${strokeWidth}" />`;
  }
  // Uniform scale so rounded die is not stretched wider/shorter than the photo face.
  const scale = Math.min(
    face.width / template.widthPx,
    face.height / template.heightPx,
  );
  const ox = face.x + (face.width - template.widthPx * scale) / 2;
  const oy = face.y + (face.height - template.heightPx * scale) / 2;
  const outline = prepareElementForOutline(
    source,
    "none",
    "#111111",
    strokeWidth,
    false,
  );
  return `<g transform="translate(${ox}, ${oy}) scale(${scale})">${outline}</g>`;
}

/**
 * Print SVG for photo plates: identical framing/layout to the proof SVG
 * (same crop viewBox + text/icon coords), without the product photo.
 * That is what makes proof and CorelDRAW registration match pixel-for-pixel.
 */
function renderBadgePrintDieSvgFromPhotoPlate(
  badge: Badge,
  template: LoadedTemplate,
  photo: ResolvedBlankBadgePhoto,
  opts: RenderOpts,
  fontDefs: string[],
  fontMappings: Map<string, string> | undefined,
): string {
  const PADDING_PX = 24;
  const crop = photo.previewCropRect;
  const W = crop.width + PADDING_PX * 2;
  const H = crop.height + PADDING_PX * 2;
  const contentTx = PADDING_PX - crop.x;
  const contentTy = PADDING_PX - crop.y;
  const face = photo.badgeFaceRect;
  const designBox = resolvePhotoTextRect(photo, badge.badgeIconId);
  const clipId = clipPathIdForSvg(opts, badge);

  const lineLayout = opts.aqbPresetTextLayout
    ? layoutAqbPresetTextLines(badge.lines || [], designBox, fontMappings)
    : calculateTextLayout(
        badge.lines || [],
        designBox,
        template,
        fontMappings,
        badge,
        undefined,
        photo.iconRect,
      );

  const badgeIconLayer = renderBadgeIconLayer(
    badge.badgeIconId,
    designBox,
    template.id,
    photo.iconRect,
  );

  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";
      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${esc(
                item.familyRaw,
              )}" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  const textClipRect = buildRectClipPathMarkup(designBox);
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;
  const styleBlock =
    fontDefs.length > 0
      ? `<style type="text/css">${fontDefs.join("\n")}</style>`
      : "";
  const outlineWidth =
    opts.outlineStrokeWidth ??
    String(Math.max(3, Math.round(face.width * 0.004)));
  const dieOutline = renderPrintDieOutlineInFaceRect(
    template,
    face,
    outlineWidth,
  );

  // Same viewBox as the proof photo plate — never force 3×1.5 with
  // preserveAspectRatio="none" (that stretched face aspect ~1.92 → 2:1).
  return `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">
  <defs>
    ${styleBlock}
  </defs>
  <g transform="translate(${contentTx}, ${contentTy})">
    <defs>
      <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
        ${textClipRect}
      </clipPath>
    </defs>
    ${dieOutline}
    ${badgeIconLayer}
    ${text}
  </g>
</svg>`.trim();
}

export function resolveProductionViewBoxPx(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): { widthPx: number; heightPx: number } {
  const plateRenderMode = resolveProductionPlateRenderMode(
    badge,
    template,
    variant,
  );
  if (plateRenderMode === "photo") {
    const photo = resolveBadgePlatePhoto(template.id, badge);
    if (photo) return getPhotoPlateViewBoxSize(photo);
  }
  return {
    widthPx: template.standardViewBoxWidth + PRODUCTION_VIEWBOX_PADDING_PX * 2,
    heightPx: template.standardViewBoxHeight + PRODUCTION_VIEWBOX_PADDING_PX * 2,
  };
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const DEFAULT_PLATE_BG = "#FFFFFF";
const DEFAULT_BORDER = "#FFFFFF";

/** Clip + gradient ids must be unique among all inline SVGs in the HTML document. */
function clipPathIdForSvg(opts: RenderOpts, badge: Badge): string {
  const scope = opts.svgDefScopeId?.replace(/[^a-zA-Z0-9_-]/g, "");
  if (scope) return `badge-clip-${scope}`;
  const bid = (badge.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "") || "noid";
  return `badge-clip-${bid}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Normalize #RGB / #RRGGBB to uppercase #RRGGBB, or null if not a hex color. */
function tryNormalizeHex(input: string | undefined | null): string | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  if (s[0] !== "#") s = `#${s}`;
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
  const n = tryNormalizeHex(hex);
  if (!n) return 1;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function isLightPlateColor(hex: string | undefined): boolean {
  const n = tryNormalizeHex(hex) ?? tryNormalizeHex(DEFAULT_PLATE_BG)!;
  return relativeLuminance(n) > 0.45;
}

/**
 * Sign Designer overlay + outline use border color; default white-on-white hides trim/art.
 * When border matches plate background (after hex normalize), use Corel-like dark/light trim.
 */
function resolveTrimColors(
  backgroundColor: string | undefined,
  borderColor: string | undefined,
  hasOverlay: boolean,
): { overlayFill: string; outlineStroke: string } {
  const bgRaw = backgroundColor?.trim() || DEFAULT_PLATE_BG;
  const borderRaw = borderColor?.trim() || DEFAULT_BORDER;
  if (!hasOverlay) {
    return {
      overlayFill: borderRaw,
      outlineStroke: borderColor ?? "#111",
    };
  }
  const bgHex = tryNormalizeHex(bgRaw);
  const brHex = tryNormalizeHex(borderRaw);
  const sameHex = bgHex && brHex && bgHex === brHex;
  const sameFallback =
    !bgHex || !brHex
      ? bgRaw.toLowerCase() === borderRaw.toLowerCase()
      : sameHex;
  if (!sameFallback) {
    return { overlayFill: borderRaw, outlineStroke: borderRaw };
  }
  const trim = isLightPlateColor(bgRaw) ? "#282828" : "#FEFEFE";
  return { overlayFill: trim, outlineStroke: trim };
}

function applySignOverlayPathFills(
  fragment: string,
  fillColor: string,
): string {
  if (!fragment) return "";
  return fragment.replace(
    /<path\s+/g,
    `<path fill="${fillColor}" fill-rule="evenodd" stroke="none" `,
  );
}

/** True when trim/border/motif overlay should paint (template must ship overlay markup). */
export function resolveSignBorderOverlayActive(
  badge: Badge,
  template: LoadedTemplate,
): boolean {
  if (template.id.startsWith("desk-")) return false;
  if (!template.overlayElement?.trim()) return false;
  const opt = badge.signBorderOptionId;
  if (opt === SIGN_BORDER_OPTION_NONE) return false;
  if (opt !== undefined && opt !== SIGN_BORDER_OPTION_NONE) return true;
  // No explicit option yet: respect legacy `signBorderEnabled` only
  if (badge.signBorderEnabled === false) return false;
  if (badge.signBorderEnabled === true) return true;
  return false;
}

export function getEffectiveDesignBox(
  template: LoadedTemplate,
  badge: Badge,
): { x: number; y: number; width: number; height: number } {
  if (resolveSignBorderOverlayActive(badge, template)) {
    return template.designBox;
  }
  return template.designBoxInnerPlate ?? template.designBox;
}

/** Photo-plate text bounds for badge preview when product photography is available. */
export function getBadgePreviewDesignBox(
  template: LoadedTemplate,
  badge: Badge,
): { x: number; y: number; width: number; height: number } {
  const photo = resolveBadgePlatePhoto(template.id, badge);
  if (photo) {
    return resolvePhotoTextRect(photo, badge.badgeIconId);
  }
  return getEffectiveDesignBox(template, badge);
}

function resolvePhotoPlateForRender(
  template: LoadedTemplate,
  badge: Badge,
  opts: RenderOpts,
): ResolvedBlankBadgePhoto | null {
  if (opts.plateRenderMode === "vector") return null;
  // print mode uses photo-plate calibration when available
  if (isPlaqueTemplateId(template.id)) return null;
  if (template.signTextLayout) return null;
  if (opts.photoPlateOverride) return opts.photoPlateOverride;
  return resolveBadgePlatePhoto(template.id, badge);
}

function buildRectClipPathMarkup(
  rect: { x: number; y: number; width: number; height: number },
): string {
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>`;
}

function renderBadgePhotoPlateSvg(
  badge: Badge,
  template: LoadedTemplate,
  photo: ResolvedBlankBadgePhoto,
  opts: RenderOpts,
  fontDefs: string[],
  fontMappings: Map<string, string> | undefined,
  inlinedPhotoHref?: string,
): string {
  if (isPrintPlateRender(opts)) {
    return renderBadgePrintDieSvgFromPhotoPlate(
      badge,
      template,
      photo,
      opts,
      fontDefs,
      fontMappings,
    );
  }

  const PADDING_PX = 24;
  const canvasW = photo.canvasWidthPx;
  const canvasH = photo.canvasHeightPx;
  const crop = photo.previewCropRect;
  const W = crop.width + PADDING_PX * 2;
  const H = crop.height + PADDING_PX * 2;
  const contentTx = PADDING_PX - crop.x;
  const contentTy = PADDING_PX - crop.y;
  const designBox = resolvePhotoTextRect(photo, badge.badgeIconId);
  const clipId = clipPathIdForSvg(opts, badge);

  const lineLayout = opts.aqbPresetTextLayout
    ? layoutAqbPresetTextLines(
        badge.lines || [],
        designBox,
        fontMappings,
      )
    : calculateTextLayout(
        badge.lines || [],
        designBox,
        template,
        fontMappings,
        badge,
        undefined,
        photo.iconRect,
      );

  const badgeIconLayer = renderBadgeIconLayer(
    badge.badgeIconId,
    designBox,
    template.id,
    photo.iconRect,
  );

  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";

      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${esc(
                item.familyRaw,
              )}" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  const textClipRect = buildRectClipPathMarkup(designBox);
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const styleBlock =
    fontDefs.length > 0
      ? `<style type="text/css">${fontDefs.join("\n")}</style>`
      : "";

  const photoHref = inlinedPhotoHref ?? photo.src;
  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  return `${svgOpen}
  <defs>
    ${styleBlock}
  </defs>
  <g transform="translate(${contentTx}, ${contentTy})">
    <defs>
      <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
        ${textClipRect}
      </clipPath>
    </defs>
    <image
      href="${photoHref}"
      xlink:href="${photoHref}"
      x="0"
      y="0"
      width="${canvasW}"
      height="${canvasH}"
      preserveAspectRatio="none"
      style="image-rendering:optimizeQuality"
    />
    ${badgeIconLayer}
    ${text}
  </g>
</svg>`.trim();
}

async function renderBadgePhotoPlateSvgAsync(
  badge: Badge,
  template: LoadedTemplate,
  photo: ResolvedBlankBadgePhoto,
  opts: RenderOpts,
  fontDefs: string[],
  fontMappings: Map<string, string> | undefined,
): Promise<string> {
  if (isPrintPlateRender(opts)) {
    return renderBadgePhotoPlateSvg(
      badge,
      template,
      photo,
      opts,
      fontDefs,
      fontMappings,
    );
  }
  const inlined = await inlineBadgeBlankPhotoSrc(photo.src);
  return renderBadgePhotoPlateSvg(
    badge,
    template,
    photo,
    opts,
    fontDefs,
    fontMappings,
    inlined,
  );
}

function resolveOptsFromBadge(
  badge: Badge,
): ResolveSignLogoSlackOptions | undefined {
  return badge.signLogoLayoutSnapshot?.minLogoRatioVsBaseline !== undefined
    ? {
        minLogoRatioVsBaselineFloor:
          badge.signLogoLayoutSnapshot.minLogoRatioVsBaseline,
      }
    : undefined;
}

/**
 * Sign text layout + fitted logo draw after reserving space for a user logo (single source of truth).
 */
export function getEffectiveSignTextLayoutAndLogoDrawForBadge(
  template: LoadedTemplate,
  badge: Badge,
): {
  layout: ResolvedSignTextLayout | undefined;
  draw: SignLogoDrawRect | null;
} {
  if (!template.signTextLayout) return { layout: undefined, draw: null };
  const trimBox = getEffectiveDesignBox(template, badge);
  const borderOn = resolveSignBorderOverlayActive(badge, template);
  // Attached plaque + image: classic/formal formats center the emblem under the inner border; others use the logo band.
  if (isPlaqueAttachedTemplateId(template.id) && badge.logo?.src?.trim()) {
    const awardFmt = resolveAttachedPlaqueAwardFormatForRender(badge);
    const useClassicAwardLogo =
      awardFmt && plaqueAwardUsesClassicAttachedLogo(awardFmt);

    const textPlate = plaqueAttachedTextPlateRect(trimBox);
    const layout = resolveSignTextLayout(
      textPlate,
      undefined,
      undefined,
      template.id,
    );

    const draw = useClassicAwardLogo
      ? plaqueAttachedLogoDrawRectClassic(
          trimBox,
          badge.logo,
          trimBox.y + trimBox.height * PLAQUE_CLASSIC_Y_PRESENTED_TO_FRAC,
          plaqueAwardLogoTopOffsetPx(trimBox, awardFmt.border),
        )
      : plaqueAttachedLogoDrawRectFixed(
          plaqueAttachedLogoBandRect(trimBox),
          badge.logo,
        );
    return { layout, draw };
  }
  // Detached photo plaque: copy + plate logo stay inside the thin inner engraving frame (not the outer metal rect).
  if (isPlaqueDetachedTemplateId(template.id)) {
    const plateOuter = trimBox;
    const plateInner = plaqueDetachedPlateContentRect(plateOuter);
    const baseLayout = resolveSignTextLayout(
      plateInner,
      undefined,
      undefined,
      template.id,
    );
    const logoOnTextPlate =
      signTemplateSupportsUserLogoUpload(template.id) &&
      !isPlaqueAttachedTemplateId(template.id);
    const logoForLayout = logoOnTextPlate ? badge.logo : undefined;
    return resolveSignTextLayoutAndUserLogoSlack(
      baseLayout,
      plateInner,
      logoForLayout,
      undefined,
      plateInner,
      badge.lines,
      createSignTextMeasure(),
      resolveOptsFromBadge(badge),
    );
  }
  // Attached plaque without the early return uses full text plate; side logos apply only to detached + signs.
  const logoOnTextPlate =
    signTemplateSupportsUserLogoUpload(template.id) &&
    !isPlaqueAttachedTemplateId(template.id);
  const logoForLayout = logoOnTextPlate ? badge.logo : undefined;
  const logoBoundsBox = resolveSignUserLogoBoundsBox(
    template,
    trimBox,
    borderOn,
  );
  return resolveSignTextLayoutAndUserLogoSlack(
    template.signTextLayout,
    trimBox,
    logoForLayout,
    template.signTextLayout.plateCircle,
    logoBoundsBox,
    badge.lines,
    createSignTextMeasure(),
    resolveOptsFromBadge(badge),
  );
}

/** Sign text layout after reserving space for a user logo (editor + renderSvg single source of truth). */
export function getEffectiveSignTextLayoutForBadge(
  template: LoadedTemplate,
  badge: Badge,
): ResolvedSignTextLayout | undefined {
  return getEffectiveSignTextLayoutAndLogoDrawForBadge(template, badge).layout;
}

/**
 * After adding or replacing a sign logo: run {@link syncSignBadgeLinesSizeNorm}, then if the fitted
 * logo is still below the minimum display fraction, shrink text one px at a time (same priority as
 * sync) until the minimum is met or fonts bottom out.
 */
export function negotiateSignBadgeLinesForLogoCommit(
  template: LoadedTemplate,
  badge: Badge,
): BadgeLine[] {
  if (!template.signTextLayout || !badge.logo?.src?.trim()) {
    return badge.lines;
  }
  if (isPlaqueAttachedTemplateId(template.id)) {
    return badge.lines;
  }
  /**
   * Plaque detached: keep logo sizing/positioning fixed (left/right) and avoid the expensive
   * 600-iteration “grow logo by shrinking text 1px” negotiation loop. We just fit text to the
   * reserved logo slack in one pass so template switches stay responsive.
   */
  if (isPlaqueDetachedTemplateId(template.id)) {
    const layout = getEffectiveSignTextLayoutForBadge(template, badge);
    if (!layout) return badge.lines;
    return syncSignBadgeLinesSizeNorm(
      badge.lines,
      layout,
      createSignTextMeasure(),
      {
        heightShrinkParticipantOrder: "lowLineIndexFirst",
      },
    );
  }

  const trimBox = getEffectiveDesignBox(template, badge);
  const placement = badge.logo?.placement ?? "left";

  let lines = badge.lines;
  for (let iter = 0; iter < 600; iter++) {
    const partial: Badge = { ...badge, lines };
    const layout = getEffectiveSignTextLayoutForBadge(template, partial);
    if (!layout) break;

    lines = syncSignBadgeLinesSizeNorm(lines, layout, createSignTextMeasure(), {
      heightShrinkParticipantOrder: "lowLineIndexFirst",
    });

    const candidate: Badge = { ...badge, lines };
    const effLayout = getEffectiveSignTextLayoutForBadge(template, candidate);
    if (!effLayout) break;

    if (!signMeasuredStackFitsForBadgeLines(lines, effLayout)) {
      break;
    }

    const { draw } = getEffectiveSignTextLayoutAndLogoDrawForBadge(
      template,
      candidate,
    );
    if (!draw) break;

    if (signLogoDrawMeetsMinDisplay(draw, trimBox, placement)) {
      return lines;
    }

    const shrunk = shrinkSignBadgeLinesOnePx(
      lines,
      effLayout,
      "lowLineIndexFirst",
    );
    if (!shrunk) break;
    lines = shrunk;
  }

  return lines;
}

/**
 * Marginal max rounded px per line (other lines fixed to `baselineLines`) such that measured stack
 * fits under {@link getEffectiveSignTextLayoutForBadge}, including snapshot ratio floor when present.
 * {@link computeSignLogoLayoutSnapshot} uses raw marginal for line 0 only; for lines 1+ merges with
 * baseline rounded px so pessimistic marginal caps don't crush lower rows.
 */
export function computeSignLogoTextPxCeilings(
  template: LoadedTemplate,
  badge: Badge,
  baselineLines: BadgeLine[],
): number[] {
  const probeBadge: Badge = { ...badge, lines: baselineLines };
  const layout0 = getEffectiveSignTextLayoutForBadge(template, probeBadge);
  const H0 =
    layout0?.designBoxHeight ?? template.signTextLayout?.designBoxHeight ?? 96;
  const MIN = SIGN_TEXT_MIN_FONT_PX;
  const MAX = layout0
    ? signTextLayoutMaxFontPx(layout0)
    : Math.max(MIN, Math.floor(H0 * 4));

  return baselineLines.map((line, lineIndex) => {
    const pxRounded = (sn: number) =>
      Math.round(Math.max(MIN, Math.min(MAX, sn * H0)));

    if (!isSignLineLayoutParticipant(line?.text)) {
      return pxRounded(line?.sizeNorm ?? 0.15);
    }

    let low = MIN;
    let high = MAX;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const testLines = baselineLines.map((l, j) =>
        j === lineIndex ? { ...l, sizeNorm: mid / H0 } : l,
      );
      const testBadge: Badge = { ...badge, lines: testLines };
      const layout = getEffectiveSignTextLayoutForBadge(template, testBadge);
      if (!layout) {
        high = mid - 1;
        continue;
      }
      const fits = signMeasuredStackFitsForBadgeLines(testLines, layout);
      if (fits) low = mid;
      else high = mid - 1;
    }
    return low;
  });
}

/**
 * Snapshot bounds after the logo + text resolve pass — call with fitted `badge.lines` after upload/sync.
 */
export function computeSignLogoLayoutSnapshot(
  template: LoadedTemplate,
  badge: Badge,
): SignLogoLayoutSnapshot | undefined {
  if (!template.signTextLayout || !badge.logo?.src?.trim()) return undefined;
  if (isPlaqueAttachedTemplateId(template.id)) return undefined;
  const badgeFreshRatio = { ...badge, signLogoLayoutSnapshot: undefined };
  const { layout, draw } = getEffectiveSignTextLayoutAndLogoDrawForBadge(
    template,
    badgeFreshRatio,
  );
  if (!layout || !draw) return undefined;

  const trimBox = getEffectiveDesignBox(template, badge);
  const borderOn = resolveSignBorderOverlayActive(badge, template);
  const logoBoundsBox = isPlaqueDetachedTemplateId(template.id)
    ? plaqueDetachedPlateContentRect(trimBox)
    : resolveSignUserLogoBoundsBox(template, trimBox, borderOn);
  const baseline = computeSignLogoDrawRect(
    badge.logo,
    logoBoundsBox,
    template.signTextLayout.plateCircle,
    layout,
  );
  if (!baseline) return undefined;
  const minLogoRatioVsBaseline = Math.min(
    draw.width / baseline.width,
    draw.height / baseline.height,
    1,
  );
  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const textPxByLine = badge.lines.map((l) =>
    Math.round(
      Math.max(MIN_FONT, Math.min(MAX_FONT, (l.sizeNorm ?? 0.15) * H)),
    ),
  );

  // Detached plaques: avoid marginal per-line ceiling probing (binary searches) — it’s expensive
  // and not needed when the logo slot width is fixed. Treat current sizes as the ceiling.
  if (isPlaqueDetachedTemplateId(template.id)) {
    return {
      minLogoRatioVsBaseline,
      textPxByLine,
      textPxCeilingByLine: [...textPxByLine],
    };
  }

  const badgeWithRatioFloor: Badge = {
    ...badge,
    signLogoLayoutSnapshot: {
      minLogoRatioVsBaseline,
      textPxByLine,
      textPxCeilingByLine: [...textPxByLine],
    },
  };
  /**
   * Line 0: pure marginal ceiling (+ downstream clamp) preserves joint solve for the headline
   * (~rounded px down to true max, then user can step back up to ceiling).
   * Lines 1+: merge max(marginal, baseline px) — marginal probe freezes line 0 and can falsely
   * cap lower rows at MIN; baseline px already fits after negotiate so ceiling never below it.
   */
  const marginalCeilings = computeSignLogoTextPxCeilings(
    template,
    badgeWithRatioFloor,
    badge.lines,
  );
  const textPxCeilingByLine = marginalCeilings.map((c, i) =>
    i === 0 ? c : Math.max(c, textPxByLine[i] ?? c),
  );

  return {
    minLogoRatioVsBaseline,
    textPxByLine,
    textPxCeilingByLine,
  };
}

/** Lower lines whose rounded px exceed snapshot ceilings (then caller may re-snapshot). */
export function clampBadgeLinesToSignLogoPxCeilings(
  template: LoadedTemplate,
  badge: Badge,
  snapshot: SignLogoLayoutSnapshot,
): BadgeLine[] {
  const layout = getEffectiveSignTextLayoutForBadge(template, badge);
  if (!layout) return badge.lines;
  const H = layout.designBoxHeight;
  const MIN_FONT = SIGN_TEXT_MIN_FONT_PX;
  const MAX_FONT = signTextLayoutMaxFontPx(layout);
  const ceilings = snapshot.textPxCeilingByLine ?? snapshot.textPxByLine;
  return badge.lines.map((l, i) => {
    const ceil = ceilings?.[i];
    if (ceil === undefined) return l;
    const px = Math.round(
      Math.max(MIN_FONT, Math.min(MAX_FONT, (l.sizeNorm ?? 0.15) * H)),
    );
    if (px <= ceil) return l;
    return { ...l, sizeNorm: ceil / H };
  });
}

function resolveSignOverlayMarkup(
  template: LoadedTemplate,
  badge: Badge,
): string {
  const styleId =
    badge.signBorderOptionId != null &&
    badge.signBorderOptionId !== SIGN_BORDER_OPTION_NONE
      ? badge.signBorderOptionId
      : badge.signBorderStyleId ?? "default";
  const fromRegistry = getSignTrimOverlayFragment(template.id, styleId);
  if (fromRegistry?.trim()) return fromRegistry.trim();
  return template.overlayElement?.trim() ?? "";
}

/** Border-only overlay + motif library paths for sign Designer templates. */
function buildSignDesignerOverlayLayer(
  template: LoadedTemplate,
  badge: Badge,
  fillColor: string,
  borderMarkup?: string | null,
): string {
  const borderBase =
    (borderMarkup?.trim() || template.overlayElement)?.trim() ?? "";
  if (!borderBase) return "";
  if (!template.designerSizeKey) {
    return applySignOverlayPathFills(borderBase, fillColor);
  }
  let motifId: DesignerMotifId = "heart";
  if (isDesignerMotifId(badge.designerMotif)) {
    motifId = badge.designerMotif;
  }
  const motifFrag = getDesignerMotifPaths(template.designerSizeKey, motifId);
  const borderLayer = applySignOverlayPathFills(borderBase, fillColor);
  const motifLayer = applySignOverlayPathFills(motifFrag, fillColor);
  if (!motifLayer) return borderLayer;
  return borderLayer.replace(/<\/g>\s*$/i, `${motifLayer}</g>`);
}

type AnyLine = {
  id?: string;
  text?: string;
  // New normalized coordinates (preferred)
  xNorm?: number;
  yNorm?: number; // 0..1 normalized within designBox
  sizeNorm?: number; // 0..1 relative to designBox.height
  // Legacy absolute coordinates (for backward compatibility)
  x?: number;
  y?: number; // legacy absolute px
  xPx?: number;
  yPx?: number; // absolute px alt
  fontSize?: number;
  fontSizeRel?: number; // absolute px OR relative to designBox.height
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  alignment?: "left" | "center" | "right"; // alternative property name
};

function toPx(
  line: AnyLine,
  designBox: { x: number; y: number; width: number; height: number },
  template?: LoadedTemplate,
): { x: number; y: number } {
  // Prefer normalized coordinates (new preferred method)
  if (line.xNorm != null && line.yNorm != null) {
    // Calculate base x position from normalized coordinate
    let x = designBox.x + line.xNorm * designBox.width;

    // Adjust x position based on alignment for proper text-anchor behavior
    const alignment = line.align || "center";
    if (alignment === "left") x = designBox.x;
    else if (alignment === "right") x = designBox.x + designBox.width;

    // y position from normalized coordinates
    let y = designBox.y + line.yNorm * designBox.height;

    // Apply vertical visual offset for house template if desired
    if (template?.id?.startsWith("house")) {
      y += designBox.height * 0.06; // push text slightly down
    }

    return { x, y };
  }

  // Fallback to absolute coordinates (backward compatibility)
  if (
    line.xPx != null ||
    line.yPx != null ||
    line.x != null ||
    line.y != null
  ) {
    return { x: line.xPx ?? line.x ?? 0, y: line.yPx ?? line.y ?? 0 };
  }

  // Default to center if no coordinates provided
  const alignment = line.align || "center";
  let defaultX = designBox.x + designBox.width * 0.5;
  if (alignment === "left") defaultX = designBox.x;
  else if (alignment === "right") defaultX = designBox.x + designBox.width;

  // Default Y with optional house offset
  let defaultY = designBox.y + designBox.height * 0.5; // geometric center
  if (template?.id?.startsWith("house")) {
    defaultY += designBox.height * 0.06; // push text slightly down
  } else {
    defaultY += designBox.height * 0.1; // small default push (was 0.6)
  }

  return { x: defaultX, y: defaultY };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function measureTextPx(
  text: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: string,
  fontStyle: string,
): { width: number; height: number; ascent: number; descent: number } {
  // SSR / non-browser fallback: rough estimates
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
  const ascent = (metrics as any).actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = (metrics as any).actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const height = Math.max(1, ascent + descent);

  return { width, height, ascent, descent };
}

/**
 * Calculates optimal text layout with uniform spacing, proportional scaling, and boundary constraints
 */
function calculateTextLayout(
  lines: AnyLine[],
  designBox: { x: number; y: number; width: number; height: number },
  template: LoadedTemplate,
  fontMappings: Map<string, string> | undefined,
  badge: Badge,
  /** When already computed for clip/logo resolve; avoids duplicate expensive work per SVG render. */
  precResolvedSignLayout?: ResolvedSignTextLayout,
  /** Calibrated icon rect on product photo — text area is separate; skip legacy icon inset. */
  photoIconRect?: { x: number; y: number; width: number; height: number },
): Array<{
  line: AnyLine;
  x: number;
  y: number;
  fontSize: number;
  anchor: string;
  familyRaw: string;
  familyEscaped: string;
  fontWeight: string;
  fontStyle: string;
}> {
  if (lines.length === 0) return [];

  if (template.signTextLayout) {
    const signLayout =
      precResolvedSignLayout ??
      getEffectiveSignTextLayoutForBadge(template, badge)!;
    const laid = layoutSignTextLines(
      lines as BadgeLine[],
      signLayout,
      (args) =>
        measureSignTextPx(
          args.text,
          fontMappings?.get(args.fontFamily) ?? args.fontFamily,
          args.fontSizePx,
          args.fontWeight,
          args.fontStyle,
        ),
      esc,
    );
    return laid.filter((row) => !isSignLineStrictEmpty(row.line.text));
  }

  const MIN_FONT = BADGE_CONSTANTS.MIN_FONT_SIZE;
  const MAX_FONT = BADGE_CONSTANTS.MAX_FONT_SIZE;
  const INSET_PX = 0.1 * 96; // 0.1" at 96 DPI
  const EXTRA_TOP_PX = 4; // try 4–8
  const iconTextInsetPx = getBadgeIconTextInsetPx(
    designBox,
    badge.badgeIconId,
    template.id,
    photoIconRect,
  );

  // Available text area (with inset for padding + optional left icon)
  const textAreaLeft = designBox.x + INSET_PX + iconTextInsetPx;
  const textAreaTop = designBox.y + INSET_PX + EXTRA_TOP_PX;
  const textAreaRight = designBox.x + designBox.width - INSET_PX;
  const textAreaBottom = designBox.y + designBox.height - INSET_PX;
  const textAreaWidth = textAreaRight - textAreaLeft;
  const textAreaHeight = textAreaBottom - textAreaTop;

  // Uniform spacing between lines (7% of design box height)
  const UNIFORM_SPACING = designBox.height * 0.07;

  // Step 1: Calculate requested sizes for all lines
  const lineData = lines.map((line, i) => {
    const baseSize = line.sizeNorm
      ? Math.round(line.sizeNorm * designBox.height)
      : line.fontSizeRel
      ? Math.round(line.fontSizeRel * designBox.height)
      : line.fontSize ?? Math.round(designBox.height * (i === 0 ? 0.23 : 0.17));

    const requestedSize = clamp(baseSize, MIN_FONT, MAX_FONT);
    const alignment = line.align || line.alignment || "center";
    const anchor =
      alignment === "center"
        ? "middle"
        : alignment === "right"
        ? "end"
        : "start";

    const originalFamily = line.fontFamily || "Inter, ui-sans-serif, system-ui";
    const familyRaw = fontMappings?.get(originalFamily) || originalFamily;
    const fontWeight = line.bold ? "bold" : "normal";
    const fontStyle = line.italic ? "italic" : "normal";

    return {
      line,
      requestedSize,
      anchor,
      familyRaw,
      fontWeight,
      fontStyle,
    };
  });

  // Step 2: Measure all lines at their requested sizes
  const measuredLines = lineData.map((item) => {
    const metrics = measureTextPx(
      item.line.text || "",
      item.familyRaw,
      item.requestedSize,
      item.fontWeight,
      item.fontStyle,
    );
    return {
      ...item,
      metrics,
    };
  });

  // Step 3: Calculate total vertical space needed with uniform spacing
  const totalVerticalSpace = measuredLines.reduce((sum, item, index) => {
    sum += item.metrics.height;
    if (index < measuredLines.length - 1) {
      sum += UNIFORM_SPACING;
    }
    return sum;
  }, 0);

  // Step 4: Calculate vertical scale factor if needed
  let verticalScale = 1;
  if (totalVerticalSpace > textAreaHeight) {
    verticalScale = textAreaHeight / totalVerticalSpace;
  }

  // Step 5: For each line, calculate horizontal scale factor
  const scaledLines = measuredLines.map((item) => {
    // First apply vertical scaling
    let scaledSize = item.requestedSize * verticalScale;

    // Then check horizontal fit
    const scaledMetrics = measureTextPx(
      item.line.text || "",
      item.familyRaw,
      scaledSize,
      item.fontWeight,
      item.fontStyle,
    );

    // Calculate available width based on alignment
    // All alignments can use the full text area width since we'll position them correctly
    const availableWidth = textAreaWidth;

    // Calculate horizontal scale if needed
    let horizontalScale = 1;
    if (scaledMetrics.width > availableWidth) {
      horizontalScale = availableWidth / scaledMetrics.width;
    }

    // Use the minimum of vertical and horizontal scales
    const finalScale = Math.min(verticalScale, horizontalScale);
    const finalSize = clamp(
      item.requestedSize * finalScale,
      MIN_FONT,
      MAX_FONT,
    );

    return {
      ...item,
      finalSize,
      finalScale,
    };
  });

  // Step 6–7: Build layout, then shrink uniformly until it fits (robust against font metric mismatch)
  const SAFETY_PX = 2; // <-- small extra margin to avoid “1px clipped” cases
  const MAX_ITERS = 12;
  const SHRINK_STEP = 0.97; // shrink 3% each retry

  // Start with the scales you already computed in Step 5
  let uniformScale = 1;

  // Helper builds positioned lines for a given extra uniformScale
  const buildPositioned = (extraScale: number) => {
    const metricsArr = scaledLines.map((item) =>
      measureTextPx(
        item.line.text || "",
        item.familyRaw,
        clamp(item.finalSize * extraScale, MIN_FONT, MAX_FONT),
        item.fontWeight,
        item.fontStyle,
      ),
    );

    const totalHeight = metricsArr.reduce((sum, m, idx) => {
      sum += m.height;
      if (idx < metricsArr.length - 1) sum += UNIFORM_SPACING;
      return sum;
    }, 0);

    const startY = textAreaTop + (textAreaHeight - totalHeight) / 2;

    let currentY = startY;
    const positioned = scaledLines.map((item, idx) => {
      const m = metricsArr[idx];

      // y is the visual middle because you render with dominant-baseline="middle"
      const y = currentY + m.height / 2;

      let x: number;
      if (item.anchor === "middle") x = textAreaLeft + textAreaWidth / 2;
      else if (item.anchor === "start") x = textAreaLeft;
      else x = textAreaRight;

      currentY +=
        m.height + (idx < scaledLines.length - 1 ? UNIFORM_SPACING : 0);

      return {
        line: item.line,
        x,
        y,
        fontSize: clamp(item.finalSize * extraScale, MIN_FONT, MAX_FONT),
        anchor: item.anchor,
        familyRaw: item.familyRaw,
        familyEscaped: esc(item.familyRaw),
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle,
      };
    });

    return { positioned, metricsArr };
  };

  let positionedLines: ReturnType<typeof buildPositioned>["positioned"] = [];
  let finalMetrics: ReturnType<typeof buildPositioned>["metricsArr"] = [];

  for (let i = 0; i < MAX_ITERS; i++) {
    const built = buildPositioned(uniformScale);
    positionedLines = built.positioned;
    finalMetrics = built.metricsArr;

    // Compute glyph bounds using ascent/descent around the visual middle
    const tops = positionedLines.map((p, idx) => {
      const m = finalMetrics[idx];
      const half = (m.ascent + m.descent) / 2;
      return p.y - half;
    });

    const bottoms = positionedLines.map((p, idx) => {
      const m = finalMetrics[idx];
      const half = (m.ascent + m.descent) / 2;
      return p.y + half;
    });

    const minTop = Math.min(...tops);
    const maxBottom = Math.max(...bottoms);

    const topOverflow = textAreaTop + SAFETY_PX - minTop; // positive means too high
    const bottomOverflow = maxBottom - (textAreaBottom - SAFETY_PX); // positive means too low

    if (topOverflow <= 0 && bottomOverflow <= 0) {
      // Fits! Done.
      return positionedLines;
    }

    // If it doesn't fit, shrink uniformly and retry
    uniformScale *= SHRINK_STEP;
  }

  // Fallback: return last attempt (should be close even if fonts differ slightly)
  return positionedLines;
}

// TEMP: force BG image sizing to prove rendering path works
const FORCE_BG_SIZE_DEBUG = false;

function renderBg(
  img: BadgeImage | undefined,
  designBox: { x: number; y: number; width: number; height: number },
): string {
  if (!img || !img.src) {
    // No background image, return empty string (background color will be handled separately)
    return "";
  }

  // Hard override while debugging: force the image to cover the whole designBox
  const iw = FORCE_BG_SIZE_DEBUG
    ? designBox.width
    : Math.max(1, img.widthPx ?? designBox.width);
  const ih = FORCE_BG_SIZE_DEBUG
    ? designBox.height
    : Math.max(1, img.heightPx ?? designBox.height);
  const scale = FORCE_BG_SIZE_DEBUG ? 1 : img.scale ?? 1;
  const offX = img.offsetX ?? 0;
  const offY = img.offsetY ?? 0;

  // Center the image within the designBox
  const centerX = designBox.x + designBox.width / 2;
  const centerY = designBox.y + designBox.height / 2;
  const transform = `translate(${centerX + offX}, ${
    centerY + offY
  }) translate(${iw / 2}, ${ih / 2}) scale(${scale}) translate(${-iw / 2}, ${
    -ih / 2
  })`;

  // Emit BOTH href and xlink:href for maximum compatibility
  return `
    <g transform="${transform}">
      <image
        href="${img.src}"
        xlink:href="${img.src}"
        x="0" y="0" width="${iw}" height="${ih}"
        preserveAspectRatio="xMidYMid slice"
        style="image-rendering:optimizeQuality"
      />
    </g>
  `;
}

/** Sign Designer user logo: fitted rect + meet. Non-sign: legacy absolute positioning. */
function renderUserLogoLayer(
  logo: BadgeImage | undefined,
  template: LoadedTemplate,
  badge: Badge,
  designBox: { x: number; y: number; width: number; height: number },
): string {
  if (!logo?.src?.trim()) return "";
  if (template.signTextLayout) {
    if (!signTemplateSupportsUserLogoUpload(template.id)) return "";
    const rect = getEffectiveSignTextLayoutAndLogoDrawForBadge(
      template,
      badge,
    ).draw;
    if (!rect) return "";
    const src = esc(logo.src);
    return `
    <image href="${src}" xlink:href="${src}"
      x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"
      preserveAspectRatio="xMidYMid meet"
      style="image-rendering:optimizeQuality" />`;
  }
  const lw = Math.max(1, logo.widthPx ?? Math.round(designBox.height * 0.3));
  const lh = Math.max(1, logo.heightPx ?? Math.round(designBox.height * 0.3));
  const x = logo.x ?? designBox.x + designBox.width * 0.1;
  const y = logo.y ?? designBox.y + designBox.height * 0.2;
  const s = logo.scale ?? 1;
  const src = esc(logo.src);
  return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <image href="${src}" x="0" y="0" width="${lw}" height="${lh}" preserveAspectRatio="none"
             style="image-rendering:optimizeQuality" />
    </g>
  `;
}

/**
 * Remove fill/stroke attributes from all descendant SVG shapes
 * and apply correct display attributes.
 * Uses DOM parsing for robust attribute manipulation.
 */
function prepareElementForOutline(
  element: string,
  fill: string,
  stroke: string,
  strokeWidth: string,
  nonScalingStroke?: boolean,
): string {
  const vectorEffectAttr = nonScalingStroke
    ? ` vector-effect="non-scaling-stroke"`
    : "";
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parser = new DOMParser();
    // Wrap element in a temporary container for parsing
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${element}</svg>`;
    const doc = parser.parseFromString(wrapped, "image/svg+xml");

    // Find all relevant SVG shape elements and update their attributes
    // This handles both direct elements and nested structures
    doc
      .querySelectorAll(
        "[id='Inner'], [id='inner'], path, rect, ellipse, circle, polygon, polyline",
      )
      .forEach((el) => {
        el.removeAttribute("class");
        el.removeAttribute("style");
        el.removeAttribute("fill");
        el.removeAttribute("stroke");
        el.removeAttribute("stroke-width");
        el.setAttribute("fill", fill);
        el.setAttribute("stroke", stroke);
        el.setAttribute("stroke-width", strokeWidth);
        if (nonScalingStroke) {
          el.setAttribute("vector-effect", "non-scaling-stroke");
        } else {
          el.removeAttribute("vector-effect");
        }
      });

    // Extract the inner element back out
    const svgEl = doc.documentElement;
    return svgEl.innerHTML;
  }

  // Fallback for SSR: use regex (less robust but works)
  let cleaned = element.replace(/\s+class\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+style\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+fill\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+stroke-width\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+vector-effect\s*=\s*["'][^"']*["']/gi, "");
  return cleaned.replace(
    /\/?>$/,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${vectorEffectAttr}/>`,
  );
}

function buildInnerFillAndClipData(
  template: LoadedTemplate,
  badge: Badge,
): { innerPathWithFill: string; innerPathData: string } {
  const innerFill = isDeskSignTemplateId(template.id)
    ? deskSignInnerFillForRender(badge, template)
    : badge.backgroundColor || "#FFFFFF";
  let innerPathWithFill: string;
  const gTransformMatch = template.innerElement.match(
    /<g[^>]*\btransform\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/g>/i,
  );

  if (gTransformMatch && gTransformMatch[2].trim()) {
    const transform = gTransformMatch[1].trim();
    const pathContent = gTransformMatch[2].trim();
    let updatedPath = pathContent.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${innerFill}"`,
    );
    updatedPath = updatedPath.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, "");
    updatedPath = updatedPath.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );
    innerPathWithFill = `<g transform="${transform}">${updatedPath}</g>`;
  } else {
    innerPathWithFill = template.innerElement.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${innerFill}"`,
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke\s*=\s*["'][^"']*["']/gi,
      "",
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );
  }

  let innerPathData = template.innerElement;
  const gMatch = innerPathData.match(/<g[^>]*>(.*?)<\/g>/s);
  if (gMatch) {
    innerPathData = gMatch[1];
  }
  const pathMatch = innerPathData.match(/<path[^>]*>/);
  if (!pathMatch) {
    const dMatch = innerPathData.match(/d=["']([^"']+)["']/);
    if (dMatch) {
      innerPathData = `<path d="${dMatch[1]}"/>`;
    }
  }
  return { innerPathWithFill, innerPathData };
}

/** Brushed-metal gradient + grain filter for featured gold/silver (horizontal brush streaks). */
function plateBrushGradientForBadgeInner(
  badge: Badge,
  template: LoadedTemplate,
  clipId: string,
  innerPathWithFill: string,
): { innerPlateMarkup: string; gradientDefXml: string } {
  if (!isFeaturedBrushedMetalPlateColor(badge.backgroundColor)) {
    return { innerPlateMarkup: innerPathWithFill, gradientDefXml: "" };
  }
  const safeClip = clipId.replace(/[^a-zA-Z0-9]/g, "");
  const filterId = `badgePlateMetalBrush${safeClip}`;
  const baseHex = normalizeFeaturedBrushedMetalBaseHex(
    badge.backgroundColor || DEFAULT_PLATE_BG,
  );
  const { defsXml, innerPlateMarkup } = plaqueMetalBrushInnerPlateTreatment({
    innerPathWithFill,
    filterId,
    baseHex,
  });
  return { innerPlateMarkup, gradientDefXml: defsXml };
}

function renderPlaqueBadgeSvg(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts,
  fontDefs: string[],
  fontMappings: Map<string, string> | undefined,
): string {
  const PADDING_PX = 24;
  const W = template.widthPx + PADDING_PX * 2;
  const H = template.heightPx + PADDING_PX * 2;
  const plateOuterRect = getEffectiveDesignBox(template, badge);
  const designBox = isPlaqueDetachedTemplateId(template.id)
    ? plaqueDetachedPlateContentRect(plateOuterRect)
    : plateOuterRect;
  const clipId = clipPathIdForSvg(opts, badge);
  const safeClip = clipId.replace(/[^a-zA-Z0-9]/g, "");
  const woodGradId = `plaqueWood${safeClip}`;
  const woodGrainFilterId = `plaqueWoodGrain${safeClip}`;

  const { innerPathWithFill, innerPathData } = buildInnerFillAndClipData(
    template,
    badge,
  );
  const plateUsesBrushedMetal = isFeaturedBrushedMetalPlateColor(
    badge.backgroundColor,
  );
  const metalBrushFilterId = `plaqueMetalBrush${safeClip}`;
  const metalPlateTreatment = plateUsesBrushedMetal
    ? plaqueMetalBrushInnerPlateTreatment({
        innerPathWithFill,
        filterId: metalBrushFilterId,
        baseHex:
          normalizeFeaturedBrushedMetalBaseHex(
            badge.backgroundColor || DEFAULT_PLATE_BG,
          ) || PLAQUE_DEFAULT_BRUSH_GOLD_HEX,
      })
    : null;
  const metalGradientDef = metalPlateTreatment?.defsXml ?? "";
  const innerPlateWithBrushFill =
    metalPlateTreatment?.innerPlateMarkup ?? innerPathWithFill;

  const effectiveSignLayout = template.signTextLayout
    ? getEffectiveSignTextLayoutForBadge(template, badge)
    : undefined;
  const layoutForTextClip = effectiveSignLayout ?? template.signTextLayout;
  const textClipW = layoutForTextClip?.clipRect?.width ?? designBox.width;
  const curveTextClip = layoutForTextClip?.plateCircle
    ? signCircleExtraInsetPx(layoutForTextClip.plateCircle.r)
    : 0;
  const textClipPathRect = buildSignTextClipPathInnerMarkup(
    layoutForTextClip,
    designBox,
    signHorizontalInsetPx(textClipW) + curveTextClip,
  );

  const awardFormat = isPlaqueAttachedTemplateId(template.id)
    ? resolveAttachedPlaqueAwardFormatForRender(badge)
    : undefined;

  let textElements: string;
  let plaqueInnerBorderMarkup = "";

  if (awardFormat && effectiveSignLayout) {
    const ink = plaqueAwardInkHex(badge.backgroundColor);
    const baseBody = Math.max(
      15,
      Math.min(
        28,
        effectiveSignLayout.contentRect.height /
          Math.max(5, awardFormat.slots.length),
      ),
    );
    const rows = layoutPlaqueAwardFormat(
      awardFormat,
      badge.lines || [],
      effectiveSignLayout,
      baseBody,
      ink,
      designBox,
      { dividerArtIdSuffix: safeClip },
    );
    textElements = plaqueAwardRowsToSvgMarkup(rows);
    if (awardFormat.border !== "none") {
      plaqueInnerBorderMarkup = plaqueAwardPlateBorderSvgMarkup({
        designBox,
        stroke: ink,
        border: awardFormat.border,
        svgFilterIdSuffix: safeClip,
      });
    }
  } else {
    const lineLayout = calculateTextLayout(
      badge.lines || [],
      designBox,
      template,
      fontMappings,
      badge,
      effectiveSignLayout,
    );

    textElements = lineLayout
      .map((item) => {
        const line = item.line;
        const color = line.color || "#000";
        const textDecoration = line.underline ? "underline" : "none";
        return `<text x="${item.x}" y="${item.y}" font-size="${
          item.fontSize
        }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${
                item.familyEscaped
              }" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
          line.text || "",
        )}</text>`;
      })
      .join("");
  }

  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const outlineColor =
    opts.showOutline === true ? "#000000" : badge.borderColor ?? "#1a1a1a";
  const outlineWidth = opts.outlineStrokeWidth ?? "1.25";
  const outlineNonScaling = opts.outlineNonScalingStroke === true;
  const outline = template.outlineElement
    ? prepareElementForOutline(
        template.outlineElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      )
    : prepareElementForOutline(
        template.innerElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      );

  const detached = isPlaqueDetachedTemplateId(template.id);
  const slot = template.plaquePhotoRectPx;
  const detachedWoodStockHref =
    detached && slot ? plaqueDetachedWoodStockPhotoHref(template.id) : null;
  const detachedStockUsesSupplierInset =
    detachedWoodStockHref === PLAQUE_DETACHED_PORTRAIT_STOCK_PATH ||
    detachedWoodStockHref === PLAQUE_DETACHED_LANDSCAPE_STOCK_PATH;
  const detachedWoodStockLayers =
    detachedWoodStockHref && slot
      ? plaqueDetachedWoodStockPlaceholderLayers({
          clipIdPrefix: clipId,
          slot,
          href: detachedWoodStockHref,
          photoHereBanner: !detachedStockUsesSupplierInset,
          preserveAspectRatio: detachedStockUsesSupplierInset
            ? "xMidYMid meet"
            : "xMidYMid slice",
        })
      : null;

  const detachedPhotoFrameFinish: PlaqueDetachedPhotoFrameFinish =
    badge.plaqueDetachedPhotoFrameFinish ?? "gold";
  const detachedPhotoFrameDecor =
    detached && slot
      ? plaqueDetachedPhotoFrameDecor({
          slot,
          finish: detachedPhotoFrameFinish,
          idSuffix: safeClip,
          templateHeightPx: template.heightPx,
        })
      : null;

  /** Wood photo opening: stock preview art + metallic frame stroke (plate upload is separate). */
  const detachedStockPhotoSlotLayer =
    detachedPhotoFrameDecor?.rectSnippet ?? "";

  const detachedPlateInnerBorderMarkup =
    detached && innerPathData
      ? plaqueDetachedPlateInnerBorderSvgMarkup({
          plateOuter: plateOuterRect,
          strokeHex: plaqueAwardInkHex(badge.backgroundColor),
        })
      : "";

  const plateLogoClipId =
    detached && innerPathData ? `${clipId}-plateContent` : clipId;

  const plateUserLogoRaw = signTemplateSupportsUserLogoUpload(template.id)
    ? renderUserLogoLayer(badge.logo, template, badge, designBox)
    : "";
  const plateUserLogoLayer =
    innerPathData && plateUserLogoRaw.trim() !== ""
      ? `<g clip-path="url(#${plateLogoClipId})">${plateUserLogoRaw}</g>`
      : plateUserLogoRaw;

  const styleBlock =
    fontDefs.length > 0
      ? `<style type="text/css">\n${fontDefs.join("\n")}\n</style>`
      : "";

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  return `${svgOpen}
  <defs>
    ${styleBlock}
    ${plaqueWoodGradientDef(woodGradId, template.widthPx)}
    ${plaqueWoodGrainFilterDef(woodGrainFilterId)}
    ${metalGradientDef}
    ${
      innerPathData
        ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${innerPathData}
    </clipPath>`
        : ""
    }
    <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
      ${textClipPathRect}
    </clipPath>
    ${
      detached && innerPathData
        ? `<clipPath id="${clipId}-plateContent" clipPathUnits="userSpaceOnUse">
      <rect x="${designBox.x}" y="${designBox.y}" width="${designBox.width}" height="${designBox.height}"/>
    </clipPath>`
        : ""
    }
    ${detachedWoodStockLayers?.defsSnippet ?? ""}
    ${detachedPhotoFrameDecor?.defsSnippet ?? ""}
  </defs>
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    ${plaqueWoodBackgroundRect(
      template.widthPx,
      template.heightPx,
      woodGradId,
      woodGrainFilterId,
    )}
    ${detachedWoodStockLayers?.bodySnippet ?? ""}
    ${detachedStockPhotoSlotLayer}
    ${innerPlateWithBrushFill}
    ${
      detachedPlateInnerBorderMarkup && innerPathData
        ? `<g clip-path="url(#${clipId})">${detachedPlateInnerBorderMarkup}</g>`
        : ""
    }
    ${
      plaqueInnerBorderMarkup && innerPathData
        ? `<g clip-path="url(#${clipId})">${plaqueInnerBorderMarkup}</g>`
        : ""
    }
    ${plateUserLogoLayer}
    ${text}
    ${outline}
  </g>
</svg>`.trim();
}

export function renderBadgeToSvgString(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {},
): string {
  if (isPlaqueTemplateId(template.id)) {
    return renderPlaqueBadgeSvg(badge, template, opts, [], undefined);
  }

  const photoPlate = resolvePhotoPlateForRender(template, badge, opts);
  if (photoPlate) {
    return renderBadgePhotoPlateSvg(
      badge,
      template,
      photoPlate,
      opts,
      [],
      undefined,
    );
  }

  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const isPrint = isPrintPlateRender(opts);
  const PADDING_PX = isPrint ? 0 : 24;
  // ViewBox must match content coordinates: innerElement/designBox are in template.widthPx × template.heightPx space.
  // Using widthPx/heightPx lets large signs fit fully; SVG then scales to container (preview) with width/height="100%".
  const W = template.widthPx + PADDING_PX * 2;
  const H = template.heightPx + PADDING_PX * 2;
  const designBox = getEffectiveDesignBox(template, badge);
  const overlayActive = resolveSignBorderOverlayActive(badge, template);
  const overlayMarkup = resolveSignOverlayMarkup(template, badge);
  const paintOverlay = overlayActive && Boolean(overlayMarkup);

  const clipId = clipPathIdForSvg(opts, badge);

  const { innerPathWithFill, innerPathData } = buildInnerFillAndClipData(
    template,
    badge,
  );
  const { innerPlateMarkup, gradientDefXml: plateBrushGradientDefXml } =
    isPrint
      ? { innerPlateMarkup: "", gradientDefXml: "" }
      : plateBrushGradientForBadgeInner(
          badge,
          template,
          clipId,
          innerPathWithFill,
        );

  const effectiveSignLayout = template.signTextLayout
    ? getEffectiveSignTextLayoutForBadge(template, badge)
    : undefined;
  const layoutForTextClip = effectiveSignLayout ?? template.signTextLayout;
  const textClipW = layoutForTextClip?.clipRect?.width ?? designBox.width;
  const curveTextClip = layoutForTextClip?.plateCircle
    ? signCircleExtraInsetPx(layoutForTextClip.plateCircle.r)
    : 0;
  const textClipPath = buildSignTextClipPathInnerMarkup(
    layoutForTextClip,
    designBox,
    signHorizontalInsetPx(textClipW) + curveTextClip,
  );

  // Background image (if present)
  const bgImageLayer =
    !isPrint && badge.backgroundImage
      ? renderBg(badge.backgroundImage, designBox)
      : "";

  // Text rendering with uniform spacing and proportional scaling
  const lineLayout = calculateTextLayout(
    badge.lines || [],
    designBox,
    template,
    undefined,
    badge,
    effectiveSignLayout,
  );

  const badgeIconLayer = renderBadgeIconLayer(
    badge.badgeIconId,
    designBox,
    template.id,
  );

  // Render text elements
  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";

      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${
                item.familyEscaped
              }" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  // Text is already positioned within bounds, but keep clipPath as safety net
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const trimColors = resolveTrimColors(
    badge.backgroundColor,
    badge.borderColor,
    paintOverlay,
  );

  // Outline for border (no fill, stroke only). On-screen preview (showOutline) uses true black so template
  // picker thumbnails match; exports omit showOutline and keep border/trim colors.
  const outlineColor =
    isPrint || opts.showOutline === true
      ? "#000000"
      : paintOverlay
      ? trimColors.outlineStroke
      : badge.borderColor ?? "#111";
  const outlineWidth = opts.outlineStrokeWidth ?? (isPrint ? "2" : "1.25");
  const outlineNonScaling = opts.outlineNonScalingStroke === true;
  const deskSignStandLayer = isPrint ? "" : buildDeskSignStandMarkup(template, badge);
  const outline =
    isDeskSignTemplateId(template.id) && !isPrint
      ? ""
      : template.outlineElement
      ? prepareElementForOutline(
          template.outlineElement,
          "none",
          outlineColor,
          outlineWidth,
          outlineNonScaling,
        )
      : prepareElementForOutline(
          template.innerElement,
          "none",
          outlineColor,
          outlineWidth,
          outlineNonScaling,
        );

  // Overlay layer (sign Designer trim/swirls): render only when present, with border color
  const borderColorForOverlay = paintOverlay
    ? trimColors.overlayFill
    : badge.borderColor ?? "#FFFFFF";
  const overlayLayer =
    isPrint || !paintOverlay
      ? ""
      : template.designerSizeKey
      ? buildSignDesignerOverlayLayer(
          template,
          badge,
          borderColorForOverlay,
          overlayMarkup,
        )
      : overlayMarkup.replace(
          /<path\s+/g,
          `<path fill="${borderColorForOverlay}" fill-rule="evenodd" stroke="none" `,
        );

  if (paintOverlay && template.id.startsWith("classic-framed-")) {
    console.log("[renderSvg] Classic Framed render:", {
      templateId: template.id,
      innerGetsBackgroundColor: badge.backgroundColor ?? "#FFFFFF",
      overlayGetsBorderColor: borderColorForOverlay,
    });
  }

  const dimensionAttrs = isPrint
    ? svgPhysicalDimensionAttrs(template)
    : `width="100%" height="100%"`;
  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     ${dimensionAttrs}
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  // Use the textClipPath already defined above (with CLIP_PADDING)
  const textClipPathRect = textClipPath;

  const userLogoRaw = renderUserLogoLayer(
    badge.logo,
    template,
    badge,
    designBox,
  );
  const userLogoLayer =
    innerPathData && userLogoRaw.trim() !== ""
      ? `<g clip-path="url(#${clipId})">${userLogoRaw}</g>`
      : userLogoRaw;

  return `${svgOpen}
  <defs>
    ${plateBrushGradientDefXml}
    ${
      innerPathData
        ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${innerPathData}
    </clipPath>`
        : ""
    }
    <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
      ${textClipPathRect}
    </clipPath>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    ${deskSignStandLayer}
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPlateMarkup}
    <!-- Background image (if present) -->
    ${bgImageLayer}
    <!-- User logo (sign): clipped to die; under border overlay and text -->
    ${userLogoLayer}
    ${overlayLayer}
    <!-- Left badge icon (name badges) -->
    ${badgeIconLayer}
    <!-- Text -->
    ${text}
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}

// Async version that embeds fonts for consistent rendering across all export formats
export async function renderBadgeToSvgStringWithFonts(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {},
): Promise<string> {
  // Collect all unique font families used in the badge
  const fontFamilies = new Set<string>();
  (badge.lines || []).forEach((line) => {
    if (line.fontFamily) {
      fontFamilies.add(line.fontFamily);
    }
  });

  // Load and embed fonts
  const fontDefs: string[] = [];
  const fontMappings = new Map<string, string>(); // original name -> embedded name

  for (const fontFamily of fontFamilies) {
    try {
      const fontData = await loadFont(fontFamily);
      if (fontData) {
        const embeddedName = `Embedded${fontFamily.replace(/\s+/g, "")}`;
        fontMappings.set(fontFamily, embeddedName);

        fontDefs.push(`
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: normal;
            font-style: normal;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: bold;
            font-style: normal;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: normal;
            font-style: italic;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: bold;
            font-style: italic;
          }
        `);
      }
    } catch (error) {
      console.warn(`Failed to load font ${fontFamily}:`, error);
    }
  }

  if (isPlaqueTemplateId(template.id)) {
    let svg = renderPlaqueBadgeSvg(
      badge,
      template,
      opts,
      fontDefs,
      fontMappings,
    );
    if (isPlaqueDetachedTemplateId(template.id)) {
      svg = await inlinePlaqueDetachedWoodStockImagesInSvg(svg);
    }
    return svg;
  }

  const photoPlate = resolvePhotoPlateForRender(template, badge, opts);
  if (photoPlate) {
    return renderBadgePhotoPlateSvgAsync(
      badge,
      template,
      photoPlate,
      opts,
      fontDefs,
      fontMappings,
    );
  }

  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const isPrint = isPrintPlateRender(opts);
  const PADDING_PX = isPrint ? 0 : 24;
  // ViewBox must match content coordinates (widthPx × heightPx) so full design fits; preview scales via width/height="100%".
  const W = template.widthPx + PADDING_PX * 2;
  const H = template.heightPx + PADDING_PX * 2;
  const designBox = getEffectiveDesignBox(template, badge);
  const overlayActive = resolveSignBorderOverlayActive(badge, template);
  const overlayMarkup = resolveSignOverlayMarkup(template, badge);
  const paintOverlay = overlayActive && Boolean(overlayMarkup);

  const clipId = clipPathIdForSvg(opts, badge);

  const { innerPathWithFill, innerPathData } = buildInnerFillAndClipData(
    template,
    badge,
  );
  const { innerPlateMarkup, gradientDefXml: plateBrushGradientDefXmlFonts } =
    isPrint
      ? { innerPlateMarkup: "", gradientDefXml: "" }
      : plateBrushGradientForBadgeInner(
          badge,
          template,
          clipId,
          innerPathWithFill,
        );

  const effectiveSignLayoutWithFonts = template.signTextLayout
    ? getEffectiveSignTextLayoutForBadge(template, badge)
    : undefined;
  const layoutForTextClipFonts =
    effectiveSignLayoutWithFonts ?? template.signTextLayout;
  const textClipWFonts =
    layoutForTextClipFonts?.clipRect?.width ?? designBox.width;
  const curveTextClipFonts = layoutForTextClipFonts?.plateCircle
    ? signCircleExtraInsetPx(layoutForTextClipFonts.plateCircle.r)
    : 0;
  const textClipPath = buildSignTextClipPathInnerMarkup(
    layoutForTextClipFonts,
    designBox,
    signHorizontalInsetPx(textClipWFonts) + curveTextClipFonts,
  );

  // Background image (if present) - rendered on top of filled inner path
  const bgImageLayer =
    !isPrint && badge.backgroundImage
      ? renderBg(badge.backgroundImage, designBox)
      : "";

  // Text rendering with embedded fonts, uniform spacing and proportional scaling
  const lineLayout = calculateTextLayout(
    badge.lines || [],
    designBox,
    template,
    fontMappings,
    badge,
    effectiveSignLayoutWithFonts,
  );

  const badgeIconLayer = renderBadgeIconLayer(
    badge.badgeIconId,
    designBox,
    template.id,
  );

  // Render text elements
  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";

      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${
                item.familyEscaped
              }" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  // Text is already positioned within bounds, but keep clipPath as safety net
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const trimColors = resolveTrimColors(
    badge.backgroundColor,
    badge.borderColor,
    paintOverlay,
  );

  // Outline for border (no fill, stroke only). On-screen preview (showOutline) uses true black so template
  // picker thumbnails match; exports omit showOutline and keep border/trim colors.
  const outlineColor =
    isPrint || opts.showOutline === true
      ? "#000000"
      : paintOverlay
      ? trimColors.outlineStroke
      : badge.borderColor ?? "#111";
  const outlineWidth = opts.outlineStrokeWidth ?? (isPrint ? "2" : "1.25");
  const outlineNonScaling = opts.outlineNonScalingStroke === true;
  const deskSignStandLayer = isPrint ? "" : buildDeskSignStandMarkup(template, badge);
  const outline =
    isDeskSignTemplateId(template.id) && !isPrint
      ? ""
      : template.outlineElement
      ? prepareElementForOutline(
          template.outlineElement,
          "none",
          outlineColor,
          outlineWidth,
          outlineNonScaling,
        )
      : prepareElementForOutline(
          template.innerElement,
          "none",
          outlineColor,
          outlineWidth,
          outlineNonScaling,
        );

  // Overlay layer (sign Designer trim/swirls): render only when present, with border color
  const borderColorForOverlay = paintOverlay
    ? trimColors.overlayFill
    : badge.borderColor ?? "#FFFFFF";
  const overlayLayer =
    isPrint || !paintOverlay
      ? ""
      : template.designerSizeKey
      ? buildSignDesignerOverlayLayer(
          template,
          badge,
          borderColorForOverlay,
          overlayMarkup,
        )
      : overlayMarkup.replace(
          /<path\s+/g,
          `<path fill="${borderColorForOverlay}" fill-rule="evenodd" stroke="none" `,
        );

  if (paintOverlay && template.id.startsWith("classic-framed-")) {
    console.log("[renderSvg] Classic Framed render:", {
      templateId: template.id,
      innerGetsBackgroundColor: badge.backgroundColor ?? "#FFFFFF",
      overlayGetsBorderColor: borderColorForOverlay,
    });
  }

  const dimensionAttrs = isPrint
    ? svgPhysicalDimensionAttrs(template)
    : `width="100%" height="100%"`;
  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     ${dimensionAttrs}
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  const userLogoRaw = renderUserLogoLayer(
    badge.logo,
    template,
    badge,
    designBox,
  );
  const userLogoLayer =
    innerPathData && userLogoRaw.trim() !== ""
      ? `<g clip-path="url(#${clipId})">${userLogoRaw}</g>`
      : userLogoRaw;

  return `${svgOpen}
  <defs>
    <style type="text/css">
      ${fontDefs.join("\n")}
    </style>
    ${plateBrushGradientDefXmlFonts}
    ${
      innerPathData
        ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${innerPathData}
    </clipPath>`
        : ""
    }
    <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
      ${textClipPath}
    </clipPath>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    ${deskSignStandLayer}
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPlateMarkup}
    ${bgImageLayer}
    ${userLogoLayer}
    ${overlayLayer}
    ${badgeIconLayer}
    ${text}
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}
