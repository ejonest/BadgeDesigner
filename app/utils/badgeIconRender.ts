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
): number {
  if (!iconId || !badgeTemplateSupportsIcon(templateId)) return 0;
  const m = iconDrawMetrics(designBox, iconId, templateId);
  if (!m) return 0;
  return m.edgePad + m.drawW + m.gap;
}

/** SVG `<image>` layer for the left pictogram, vertically centered in the design box. */
export function renderBadgeIconLayer(
  iconId: string | undefined,
  designBox: { x: number; y: number; width: number; height: number },
  templateId?: string,
): string {
  if (!iconId || !badgeTemplateSupportsIcon(templateId)) return "";
  const href = BADGE_ICON_DATA_URLS[iconId];
  const m = iconDrawMetrics(designBox, iconId, templateId);
  if (!href || !m) return "";
  const x = designBox.x + m.edgePad;
  const y = designBox.y + (designBox.height - m.drawH) / 2;
  return `<image href="${href}" x="${x}" y="${y}" width="${m.drawW}" height="${m.drawH}" preserveAspectRatio="xMidYMid meet" />`;
}
