import badgeBlankPhotosJson from "~/data/badge-blank-photos.local.json";
import {
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
  LEGACY_BRUSHED_GOLD_HEX,
  LEGACY_BRUSHED_SILVER_HEX,
} from "~/constants/colors";

export type NormRect = {
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BlankPhotoPlateConfig = {
  assetFolder: string;
  filePrefix: string;
  /** Where the physical badge sits on the photo (SVG overlay aligns here). */
  badgeFaceRectNorm?: NormRect;
  /** Visible preview window on the photo canvas (badge + a little margin). */
  previewCropRectNorm?: NormRect;
  /** Text layout when no left pictogram is selected. */
  textRectNorm: NormRect;
  /** Text layout when a left pictogram is selected (typically right of icon). */
  textWithIconRectNorm?: NormRect;
  iconRectNorm: NormRect;
};

export type ResolvedBlankBadgePhoto = {
  src: string;
  badgeFaceRect: PixelRect;
  /** Region of the photo canvas shown in live preview / thumbnails. */
  previewCropRect: PixelRect;
  textRect: PixelRect;
  textWithIconRect: PixelRect;
  iconRect: PixelRect;
  canvasWidthPx: number;
  canvasHeightPx: number;
};

type BadgeBlankPhotosFile = {
  version: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  templates: Record<string, BlankPhotoPlateConfig>;
  colorSuffixByHex: Record<string, string>;
};

const photoCfg = badgeBlankPhotosJson as BadgeBlankPhotosFile;

const BRUSHED_GOLD_ALIASES = new Set([
  FEATURED_BRUSHED_GOLD_HEX.toUpperCase(),
  LEGACY_BRUSHED_GOLD_HEX.toUpperCase(),
]);

const BRUSHED_SILVER_ALIASES = new Set([
  FEATURED_BRUSHED_SILVER_HEX.toUpperCase(),
  LEGACY_BRUSHED_SILVER_HEX.toUpperCase(),
]);

/** Normalize user/API hex to uppercase #RRGGBB for lookup. */
export function normalizeBadgePhotoColorHex(color: string | undefined): string {
  const raw = (color ?? "").trim();
  if (!raw) return "#FFFFFF";
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return withHash.toUpperCase();
}

/** Map featured / legacy brushed-metal hexes to canonical photo suffix keys. */
function canonicalPhotoColorHex(normalized: string): string {
  if (BRUSHED_GOLD_ALIASES.has(normalized)) return FEATURED_BRUSHED_GOLD_HEX.toUpperCase();
  if (BRUSHED_SILVER_ALIASES.has(normalized)) return FEATURED_BRUSHED_SILVER_HEX.toUpperCase();
  return normalized;
}

export function denormalizeRect(
  norm: NormRect,
  canvasW: number,
  canvasH: number,
): PixelRect {
  return {
    x: norm.xNorm * canvasW,
    y: norm.yNorm * canvasH,
    width: norm.widthNorm * canvasW,
    height: norm.heightNorm * canvasH,
  };
}

/** Default preview crop = badge face plus modest margin (until calibrated). */
export function defaultPreviewCropRect(
  badgeFaceRect: PixelRect,
  canvasW: number,
  canvasH: number,
): PixelRect {
  const padX = Math.max(36, badgeFaceRect.width * 0.14);
  const padY = Math.max(36, badgeFaceRect.height * 0.22);
  const x = Math.max(0, badgeFaceRect.x - padX);
  const y = Math.max(0, badgeFaceRect.y - padY);
  const right = Math.min(canvasW, badgeFaceRect.x + badgeFaceRect.width + padX);
  const bottom = Math.min(
    canvasH,
    badgeFaceRect.y + badgeFaceRect.height + padY,
  );
  return {
    x,
    y,
    width: Math.max(48, right - x),
    height: Math.max(48, bottom - y),
  };
}

export function resolvePreviewCropRect(
  plate: BlankPhotoPlateConfig,
  badgeFaceRect: PixelRect,
  canvasW: number,
  canvasH: number,
): PixelRect {
  if (plate.previewCropRectNorm) {
    return denormalizeRect(plate.previewCropRectNorm, canvasW, canvasH);
  }
  return defaultPreviewCropRect(badgeFaceRect, canvasW, canvasH);
}

/** Default badge face = union of text + icon rects with a little padding. */
export function defaultBadgeFaceRect(
  textRect: PixelRect,
  iconRect: PixelRect,
): PixelRect {
  const minX = Math.min(textRect.x, iconRect.x);
  const minY = Math.min(textRect.y, iconRect.y);
  const maxX = Math.max(textRect.x + textRect.width, iconRect.x + iconRect.width);
  const maxY = Math.max(textRect.y + textRect.height, iconRect.y + iconRect.height);
  const pad = Math.max(8, (maxY - minY) * 0.06);
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** Default text-with-icon area = text rect minus icon column on the left. */
export function defaultTextWithIconRect(
  textRect: PixelRect,
  iconRect: PixelRect,
): PixelRect {
  const gap = Math.max(4, iconRect.width * 0.08);
  const x = iconRect.x + iconRect.width + gap;
  const right = textRect.x + textRect.width;
  return {
    x,
    y: textRect.y,
    width: Math.max(20, right - x),
    height: textRect.height,
  };
}

/** Pick text layout rect for preview/render based on whether an icon is active. */
export function resolvePhotoTextRect(
  photo: ResolvedBlankBadgePhoto,
  badgeIconId: string | undefined,
): PixelRect {
  if (badgeIconId?.trim()) {
    return photo.textWithIconRect;
  }
  return photo.textRect;
}

export function getBlankPhotoPlateConfig(
  templateId: string | undefined,
): BlankPhotoPlateConfig | null {
  if (!templateId) return null;
  return photoCfg.templates[templateId] ?? null;
}

export function badgeColorHasPhoto(backgroundColor: string | undefined): boolean {
  const normalized = canonicalPhotoColorHex(
    normalizeBadgePhotoColorHex(backgroundColor),
  );
  return Boolean(photoCfg.colorSuffixByHex[normalized]);
}

export function getPhotoColorSuffix(
  backgroundColor: string | undefined,
): string | null {
  const normalized = canonicalPhotoColorHex(
    normalizeBadgePhotoColorHex(backgroundColor),
  );
  return photoCfg.colorSuffixByHex[normalized] ?? null;
}

export function buildBlankBadgePhotoSrc(
  plate: BlankPhotoPlateConfig,
  colorSuffix: string,
): string {
  const fileName = `${plate.filePrefix}-(${colorSuffix}).jpg`;
  return `/badge-blanks/${plate.assetFolder}/${fileName}`;
}

/** Build resolved photo plate from pixel rects (calibration live preview). */
export function buildResolvedBlankBadgePhotoFromPixelRects(
  src: string,
  rects: {
    badgeFaceRect: PixelRect;
    previewCropRect: PixelRect;
    textRect: PixelRect;
    textWithIconRect: PixelRect;
    iconRect: PixelRect;
  },
  canvasWidthPx = photoCfg.canvasWidthPx,
  canvasHeightPx = photoCfg.canvasHeightPx,
): ResolvedBlankBadgePhoto {
  return {
    src,
    badgeFaceRect: rects.badgeFaceRect,
    previewCropRect: rects.previewCropRect,
    textRect: rects.textRect,
    textWithIconRect: rects.textWithIconRect,
    iconRect: rects.iconRect,
    canvasWidthPx,
    canvasHeightPx,
  };
}

/**
 * Resolve product photo + layout rects for badge preview rendering.
 * Returns null when template or color has no photo asset.
 */
export function resolveBlankBadgePhoto(
  templateId: string | undefined,
  backgroundColor: string | undefined,
): ResolvedBlankBadgePhoto | null {
  const plate = getBlankPhotoPlateConfig(templateId);
  if (!plate) return null;

  const colorSuffix = getPhotoColorSuffix(backgroundColor);
  if (!colorSuffix) return null;

  const canvasWidthPx = photoCfg.canvasWidthPx;
  const canvasHeightPx = photoCfg.canvasHeightPx;

  const textRect = denormalizeRect(
    plate.textRectNorm,
    canvasWidthPx,
    canvasHeightPx,
  );
  const iconRect = denormalizeRect(
    plate.iconRectNorm,
    canvasWidthPx,
    canvasHeightPx,
  );
  const badgeFaceRect = plate.badgeFaceRectNorm
    ? denormalizeRect(plate.badgeFaceRectNorm, canvasWidthPx, canvasHeightPx)
    : defaultBadgeFaceRect(textRect, iconRect);
  const previewCropRect = resolvePreviewCropRect(
    plate,
    badgeFaceRect,
    canvasWidthPx,
    canvasHeightPx,
  );
  const textWithIconRect = plate.textWithIconRectNorm
    ? denormalizeRect(
        plate.textWithIconRectNorm,
        canvasWidthPx,
        canvasHeightPx,
      )
    : defaultTextWithIconRect(textRect, iconRect);

  return {
    src: buildBlankBadgePhotoSrc(plate, colorSuffix),
    badgeFaceRect,
    previewCropRect,
    textRect,
    textWithIconRect,
    iconRect,
    canvasWidthPx,
    canvasHeightPx,
  };
}

export function getBlankPhotoCanvasSize(): {
  widthPx: number;
  heightPx: number;
} {
  return {
    widthPx: photoCfg.canvasWidthPx,
    heightPx: photoCfg.canvasHeightPx,
  };
}

/** SVG viewBox size for photo-plate renders (crop region + renderSvg 24px padding). */
export function getPhotoPlateViewBoxSize(
  photo?: Pick<ResolvedBlankBadgePhoto, "previewCropRect"> | null,
): {
  widthPx: number;
  heightPx: number;
} {
  const PADDING_PX = 24;
  const crop = photo?.previewCropRect;
  if (crop) {
    return {
      widthPx: crop.width + PADDING_PX * 2,
      heightPx: crop.height + PADDING_PX * 2,
    };
  }
  return {
    widthPx: photoCfg.canvasWidthPx + PADDING_PX * 2,
    heightPx: photoCfg.canvasHeightPx + PADDING_PX * 2,
  };
}

/** All template ids with blank photo config (for calibration UI). */
export function listBlankPhotoTemplateIds(): string[] {
  return Object.keys(photoCfg.templates);
}

/** Export full config for calibration download. */
export function getBlankPhotoConfigFile(): BadgeBlankPhotosFile {
  return photoCfg;
}

/** Color suffix options for calibration color picker. */
export function listBlankPhotoColorOptions(): Array<{
  hex: string;
  suffix: string;
  label: string;
}> {
  const seen = new Set<string>();
  const out: Array<{ hex: string; suffix: string; label: string }> = [];
  for (const [hex, suffix] of Object.entries(photoCfg.colorSuffixByHex)) {
    if (seen.has(suffix)) continue;
    seen.add(suffix);
    out.push({
      hex,
      suffix,
      label: suffix.replace(/-/g, " "),
    });
  }
  return out;
}
