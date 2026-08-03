import type { Badge } from "~/types/badge";
import type { DesignerVariant } from "~/constants/designerVariants";
import { isSignLikeVariant } from "~/constants/designerVariants";
import { loadTemplateById, type LoadedTemplate } from "~/utils/templates";
import {
  DRAFT_FULL_BADGE_IMAGE_OPTIONS,
  generateFullBadgeImage,
} from "~/utils/badgeThumbnail";
import { generatePrintSVGAsBlob } from "~/utils/export";
import { mapWithConcurrency } from "~/utils/mapWithConcurrency";
import {
  resolveCustomBadgeBackgroundPrintImageSrc,
  resolveBadgePlatePhoto,
} from "~/utils/badgeCustomBackgrounds";
import { inlineBadgeBlankPhotoSrc } from "~/utils/inlineBadgePhoto";

export type DraftBadgeAssetBlobs = {
  pngBlob: Blob;
  printSvgBlob: Blob;
  i: number;
};

/** One-shot cart/proof assets: JPEG (PDF + thumbnail) + print SVG only. */
export type CartProofBadgeAssets = {
  i: number;
  jpegDataUrl: string;
  jpegBlob: Blob;
  printSvgBlob: Blob;
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
 * Render draft thumbnail JPEG + print SVG for each badge.
 * Design SVG is omitted (production uses print SVG; cart/PDF use JPEG).
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
        const [dataUrl, printSvgBlob] = await Promise.all([
          generateFullBadgeImage(b, variant, DRAFT_FULL_BADGE_IMAGE_OPTIONS),
          generatePrintSVGAsBlob(b, template, variant),
        ]);
        const pngBlob = dataURLToBlob(dataUrl);
        return {
          pngBlob: pngBlob.size > 0 ? pngBlob : new Blob(),
          printSvgBlob:
            printSvgBlob?.size > 0 ? printSvgBlob : new Blob(),
          i,
        };
      } catch (err) {
        console.warn(
          "[generateDraftBadgeAssetBlobs] badge",
          i,
          "JPEG/print SVG failed",
          err,
        );
        return {
          pngBlob: new Blob(),
          printSvgBlob: new Blob(),
          i,
        };
      }
    },
  );
}

/**
 * One-shot assets for proof PDF + cart finalize: JPEG + print SVG per badge.
 * Loads each badge's template so multi-shape orders stay correct.
 */
export async function generateCartProofBadgeAssets(
  badges: readonly Badge[],
  variant: DesignerVariant,
): Promise<CartProofBadgeAssets[]> {
  await warmDraftBadgeImageCache(badges);
  const fallbackTemplateId = isSignLikeVariant(variant)
    ? "circle-4x4"
    : "rect-1x3";

  return mapWithConcurrency(
    badges,
    DRAFT_BADGE_RENDER_CONCURRENCY,
    async (b, i) => {
      try {
        const templateId = b.templateId || fallbackTemplateId;
        const tmpl = await loadTemplateById(templateId, variant);
        if (!tmpl) {
          console.warn(
            "[generateCartProofBadgeAssets] template missing",
            templateId,
          );
          return {
            i,
            jpegDataUrl: "",
            jpegBlob: new Blob(),
            printSvgBlob: new Blob(),
          };
        }
        const [jpegDataUrl, printSvgBlob] = await Promise.all([
          generateFullBadgeImage(b, variant, DRAFT_FULL_BADGE_IMAGE_OPTIONS),
          generatePrintSVGAsBlob(b, tmpl, variant),
        ]);
        const jpegBlob = dataURLToBlob(jpegDataUrl);
        return {
          i,
          jpegDataUrl,
          jpegBlob: jpegBlob.size > 0 ? jpegBlob : new Blob(),
          printSvgBlob:
            printSvgBlob?.size > 0 ? printSvgBlob : new Blob(),
        };
      } catch (err) {
        console.warn(
          "[generateCartProofBadgeAssets] badge",
          i,
          "failed",
          err,
        );
        return {
          i,
          jpegDataUrl: "",
          jpegBlob: new Blob(),
          printSvgBlob: new Blob(),
        };
      }
    },
  );
}
