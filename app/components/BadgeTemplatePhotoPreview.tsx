import * as React from "react";
import {
  buildBadgeTemplatePhotoThumbSvg,
  resolveBlankBadgePhoto,
} from "~/utils/badgeBlankPhotos";

type BadgeTemplatePhotoPreviewProps = {
  templateId: string;
  backgroundColor: string;
  className?: string;
  alt?: string;
};

/**
 * Template-picker preview: cropped product photo (no text), same crop as live preview.
 * Sync SVG + photo URL (inline SVG in the DOM loads /badge-blanks/ reliably).
 */
export function BadgeTemplatePhotoPreview({
  templateId,
  backgroundColor,
  className,
  alt = "Badge template preview",
}: BadgeTemplatePhotoPreviewProps) {
  const svgMarkup = React.useMemo(
    () => buildBadgeTemplatePhotoThumbSvg(templateId, backgroundColor),
    [templateId, backgroundColor],
  );

  const photoSrc = React.useMemo(
    () => resolveBlankBadgePhoto(templateId, backgroundColor)?.src ?? null,
    [templateId, backgroundColor],
  );

  if (svgMarkup) {
    return (
      <div
        className={`flex h-[70px] w-full items-center justify-center ${
          className ?? ""
        }`}
      >
        <div
          className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
          role="img"
          aria-label={alt}
        />
      </div>
    );
  }

  if (photoSrc) {
    return (
      <img
        src={photoSrc}
        alt={alt}
        className={`h-[70px] w-auto max-w-full object-contain ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      className={`flex h-[70px] w-full items-center justify-center text-[10px] text-[#6b7f92] ${
        className ?? ""
      }`}
      aria-label={alt}
    >
      Preview unavailable
    </div>
  );
}
