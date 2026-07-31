import type { Badge } from "~/types/badge";
import type { DesignerVariant } from "~/constants/designerVariants";
import type { LoadedTemplate } from "~/utils/templates";
import {
  DRAFT_FULL_BADGE_IMAGE_OPTIONS,
  generateFullBadgeImage,
} from "~/utils/badgeThumbnail";
import {
  generatePrintSVGAsBlob,
  generateSVGAsBlob,
} from "~/utils/export";
import { mapWithConcurrency } from "~/utils/mapWithConcurrency";
import {
  resolveCustomBadgeBackgroundPrintImageSrc,
  resolveBadgePlatePhoto,
} from "~/utils/badgeCustomBackgrounds";
import { inlineBadgeBlankPhotoSrc } from "~/utils/inlineBadgePhoto";

export type DraftBadgeAssetBlobs = {
  pngBlob: Blob;
  svgBlob: Blob;
  printSvgBlob: Blob;
  i: number;
};

/** Keep a few badges in flight without melting the main thread / memory. */
export const DRAFT_BADGE_RENDER_CONCURRENCY = 3;

function dataURLToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch?.[1] ?? "image/jpeg";
  const binary = atob(parts[1] ?? "");
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Warm the photo/bleed inline cache once before bulk draft renders. */
export async function warmDraftBadgeImageCache(
  badges: readonly Badge[],
): Promise<void> {
  const srcs = new Set<string>();
  for (const badge of badges) {
    const photo = resolveBadgePlatePhoto(badge.templateId || "rect-1x3", badge);
    if (photo?.src) srcs.add(photo.src);
    const bleed = resolveCustomBadgeBackgroundPrintImageSrc(
      badge.customBadgeBackgroundId,
    );
    if (bleed) srcs.add(bleed);
  }
  await Promise.all(
    [...srcs].map((src) =>
      inlineBadgeBlankPhotoSrc(src).catch(() => src),
    ),
  );
}

/**
 * Render draft thumbnail + design SVG + print SVG for each badge.
 * Uses JPEG draft thumbnails (full SVG quality preserved) and bounded concurrency.
 */
export async function generateDraftBadgeAssetBlobs(
  badges: readonly Badge[],
  template: LoadedTemplate,
  variant: DesignerVariant,
): Promise<DraftBadgeAssetBlobs[]> {
  await warmDraftBadgeImageCache(badges);

  return mapWithConcurrency(
    badges,
    DRAFT_BADGE_RENDER_CONCURRENCY,
    async (b, i) => {
      try {
        const [dataUrl, svgBlob, printSvgBlob] = await Promise.all([
          generateFullBadgeImage(b, variant, DRAFT_FULL_BADGE_IMAGE_OPTIONS),
          generateSVGAsBlob(b, template, variant),
          generatePrintSVGAsBlob(b, template, variant),
        ]);
        const pngBlob = dataURLToBlob(dataUrl);
        return {
          pngBlob: pngBlob.size > 0 ? pngBlob : new Blob(),
          svgBlob: svgBlob?.size > 0 ? svgBlob : new Blob(),
          printSvgBlob:
            printSvgBlob?.size > 0 ? printSvgBlob : new Blob(),
          i,
        };
      } catch (err) {
        console.warn(
          "[generateDraftBadgeAssetBlobs] badge",
          i,
          "PNG/SVG failed",
          err,
        );
        return {
          pngBlob: new Blob(),
          svgBlob: new Blob(),
          printSvgBlob: new Blob(),
          i,
        };
      }
    },
  );
}
