import {
  BADGE_ICON_DATA_URLS,
  BADGE_ICON_NATURAL_SIZE,
} from "~/constants/badgeIconDataUrls";
import { isBadgeIconId } from "~/constants/badgeIcons";
import {
  BADGE_ICON_DRAW_WIDTH_FRAC,
  BADGE_ICON_TEXT_GAP_FRAC,
  badgeIconLeftPadFrac,
  badgeTemplateSupportsIcon,
} from "~/constants/badgeIconLayout";
import type { PixelRect } from "~/utils/badgeBlankPhotos";

function iconDrawMetrics(
  designBox: { height: number },
  iconId: string,
  templateId?: string,
): { drawW: number; drawH: number; edgePad: number; gap: number } | null {
  if (!isBadgeIconId(iconId)) return null;
  const natural = BADGE_ICON_NATURAL_SIZE[iconId];
  if (!natural?.width || !natural?.height) return null;

  const edgePad = designBox.height * badgeIconLeftPadFrac(templateId);
  const gap = designBox.height * BADGE_ICON_TEXT_GAP_FRAC;

  const drawW = designBox.height * BADGE_ICON_DRAW_WIDTH_FRAC;
  const drawH = drawW * (natural.height / natural.width);

  return { drawW, drawH, edgePad, gap };
}

/** Extra left inset (px) reserved for text when a badge icon is active. */
export function getBadgeIconTextInsetPx(
  designBox: { width: number; height: number },
  iconId: string | undefined,
  templateId?: string,
  /** When set, icon lives in a separate calibrated rect — text area already excludes it. */
  photoIconRect?: PixelRect,
): number {
  if (photoIconRect) return 0;
  if (!iconId || !badgeTemplateSupportsIcon(templateId)) return 0;
  const m = iconDrawMetrics(designBox, iconId, templateId);
  if (!m) return 0;
  return m.edgePad + m.drawW + m.gap;
}

function fitIconInRect(
  natural: { width: number; height: number },
  box: PixelRect,
): { x: number; y: number; width: number; height: number } {
  const boxAspect = box.width / box.height;
  const iconAspect = natural.width / natural.height;
  let drawW: number;
  let drawH: number;
  if (iconAspect > boxAspect) {
    drawW = box.width;
    drawH = box.width / iconAspect;
  } else {
    drawH = box.height;
    drawW = box.height * iconAspect;
  }
  return {
    x: box.x + (box.width - drawW) / 2,
    y: box.y + (box.height - drawH) / 2,
    width: drawW,
    height: drawH,
  };
}

/** SVG `<image>` layer for the left pictogram, vertically centered in the design box. */
export function renderBadgeIconLayer(
  iconId: string | undefined,
  designBox: { x: number; y: number; width: number; height: number },
  templateId?: string,
  iconRectOverride?: PixelRect,
): string {
  if (!iconId || !badgeTemplateSupportsIcon(templateId)) return "";
  const href = BADGE_ICON_DATA_URLS[iconId];
  if (!href) return "";

  if (iconRectOverride) {
    const natural = BADGE_ICON_NATURAL_SIZE[iconId as keyof typeof BADGE_ICON_NATURAL_SIZE];
    if (!natural?.width || !natural?.height) return "";
    const fit = fitIconInRect(natural, iconRectOverride);
    return `<image href="${href}" x="${fit.x}" y="${fit.y}" width="${fit.width}" height="${fit.height}" preserveAspectRatio="xMidYMid meet" />`;
  }

  const m = iconDrawMetrics(designBox, iconId, templateId);
  if (!m) return "";
  const x = designBox.x + m.edgePad;
  const y = designBox.y + (designBox.height - m.drawH) / 2;
  return `<image href="${href}" x="${x}" y="${y}" width="${m.drawW}" height="${m.drawH}" preserveAspectRatio="xMidYMid meet" />`;
}
