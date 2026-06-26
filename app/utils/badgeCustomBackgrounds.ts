import badgeCustomBackgroundsJson from "~/data/badge-custom-backgrounds.local.json";
import type { Badge } from "~/types/badge";
import {
  buildResolvedBlankBadgePhotoFromPixelRects,
  defaultBadgeFaceRect,
  defaultPreviewCropRect,
  defaultTextWithIconRect,
  denormalizeRect,
  resolveBlankBadgePhoto,
  type NormRect,
  type ResolvedBlankBadgePhoto,
} from "~/utils/badgeBlankPhotos";

export type CustomBadgeBackgroundEntry = {
  id: string;
  name: string;
  category: string;
  templateId: string;
  fileName: string;
  textRectNorm: NormRect;
  iconRectNorm: NormRect;
  badgeFaceRectNorm?: NormRect;
  textWithIconRectNorm?: NormRect;
  previewCropRectNorm?: NormRect;
};

type CustomBadgeBackgroundsFile = {
  version: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  backgrounds: CustomBadgeBackgroundEntry[];
};

const cfg = badgeCustomBackgroundsJson as CustomBadgeBackgroundsFile;

export const ROUNDED_RECT_BADGE_TEMPLATE_IDS = [
  "rect-1x3",
  "rect-1_5x3",
] as const;

export type RoundedRectBadgeTemplateId =
  (typeof ROUNDED_RECT_BADGE_TEMPLATE_IDS)[number];

export function badgeTemplateHasStyleStep(
  templateId: string | undefined,
): boolean {
  if (!templateId) return false;
  return ROUNDED_RECT_BADGE_TEMPLATE_IDS.includes(
    templateId as RoundedRectBadgeTemplateId,
  );
}

export function buildCustomBadgeBackgroundSrc(fileName: string): string {
  return `/badge-custom-backgrounds/${fileName}`;
}

export function getCustomBadgeBackgroundById(
  id: string | undefined,
): CustomBadgeBackgroundEntry | undefined {
  if (!id?.trim()) return undefined;
  return cfg.backgrounds.find((b) => b.id === id);
}

export function listCustomBadgeBackgroundsForTemplate(
  templateId: string,
): CustomBadgeBackgroundEntry[] {
  return cfg.backgrounds.filter((b) => b.templateId === templateId);
}

export function listCustomBadgeBackgroundCategoriesForTemplate(
  templateId: string,
): Array<{ category: string; items: CustomBadgeBackgroundEntry[] }> {
  const items = listCustomBadgeBackgroundsForTemplate(templateId);
  const byCategory = new Map<string, CustomBadgeBackgroundEntry[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryItems]) => ({
      category,
      items: categoryItems.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function getCustomBackgroundDisplayName(id: string): string | null {
  const entry = getCustomBadgeBackgroundById(id);
  if (!entry) return null;
  return `${entry.category} · ${entry.name}`;
}

export function resolveCustomBadgeBackground(
  id: string,
): ResolvedBlankBadgePhoto | null {
  const entry = getCustomBadgeBackgroundById(id);
  if (!entry) return null;

  const canvasWidthPx = cfg.canvasWidthPx;
  const canvasHeightPx = cfg.canvasHeightPx;

  const textRect = denormalizeRect(
    entry.textRectNorm,
    canvasWidthPx,
    canvasHeightPx,
  );
  const iconRect = denormalizeRect(
    entry.iconRectNorm,
    canvasWidthPx,
    canvasHeightPx,
  );
  const badgeFaceRect = entry.badgeFaceRectNorm
    ? denormalizeRect(entry.badgeFaceRectNorm, canvasWidthPx, canvasHeightPx)
    : defaultBadgeFaceRect(textRect, iconRect);
  const previewCropRect = entry.previewCropRectNorm
    ? denormalizeRect(entry.previewCropRectNorm, canvasWidthPx, canvasHeightPx)
    : defaultPreviewCropRect(badgeFaceRect, canvasWidthPx, canvasHeightPx);
  const textWithIconRect = entry.textWithIconRectNorm
    ? denormalizeRect(entry.textWithIconRectNorm, canvasWidthPx, canvasHeightPx)
    : defaultTextWithIconRect(textRect, iconRect);

  return buildResolvedBlankBadgePhotoFromPixelRects(
    buildCustomBadgeBackgroundSrc(entry.fileName),
    {
      badgeFaceRect,
      previewCropRect,
      textRect,
      textWithIconRect,
      iconRect,
    },
    canvasWidthPx,
    canvasHeightPx,
  );
}

/** Plain color blank or custom design photo plate for badge preview/render. */
export function resolveBadgePlatePhoto(
  templateId: string | undefined,
  badge: Pick<
    Badge,
    "backgroundColor" | "badgeIconId" | "customBadgeBackgroundId"
  >,
): ResolvedBlankBadgePhoto | null {
  if (badge.customBadgeBackgroundId) {
    const custom = resolveCustomBadgeBackground(badge.customBadgeBackgroundId);
    if (custom) return custom;
  }
  return resolveBlankBadgePhoto(templateId, badge.backgroundColor);
}

export function getCustomBackgroundConfigFile(): CustomBadgeBackgroundsFile {
  return cfg;
}

export function listCustomBadgeBackgroundIds(): string[] {
  return cfg.backgrounds.map((b) => b.id);
}
