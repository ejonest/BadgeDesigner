import type React from "react";
import { svgMarkupToImageSrc } from "~/utils/svgDataUrl";
import type { DesignerVariant } from "~/constants/designerVariants";

type TemplatePreviewThumbProps = {
  svgMarkup?: string;
  variant: DesignerVariant;
  alt: string;
  className?: string;
  imgStyle?: React.CSSProperties;
  fallbackSrc: string;
  onImgError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
};

/**
 * Badge template photos must render as inline SVG (like live preview). Embedding the
 * same SVG in a data-URL <img> blocks /badge-blanks/ photos from painting.
 */
export function TemplatePreviewThumb({
  svgMarkup,
  variant,
  alt,
  className,
  imgStyle,
  fallbackSrc,
  onImgError,
}: TemplatePreviewThumbProps) {
  if (svgMarkup && variant === "badge") {
    return (
      <div
        className={`flex items-center justify-center [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full ${
          className ?? ""
        }`}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
        role="img"
        aria-label={alt}
      />
    );
  }

  const src =
    svgMarkup && svgMarkup.trim().length > 0
      ? svgMarkupToImageSrc(svgMarkup)
      : fallbackSrc;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={imgStyle}
      onError={onImgError}
    />
  );
}
