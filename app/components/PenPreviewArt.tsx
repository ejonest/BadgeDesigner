import { useMemo } from "react";

import type { PenPreviewPhoto } from "~/constants/pen";
import { layoutEngraving, lineOffsets } from "~/utils/penEngraving";

interface PenPreviewArtProps {
  photo: PenPreviewPhoto;
  text: string;
  fontStack: string;
  bold: boolean;
  italic: boolean;
  logoDataUrl?: string | null;
}

/**
 * Draws the customer's artwork onto a product photo.
 *
 * The overlay is an SVG in the photo's own pixel coordinates, so it scales with
 * the photo instead of with the surrounding layout. Artwork is laid out in a
 * flat rectangle and then mapped onto the surface's measured quad by an affine
 * transform, which gives it the same rotation and foreshortening as the
 * engraving area it sits on.
 */
export function PenPreviewArt({
  photo,
  text,
  fontStack,
  bold,
  italic,
  logoDataUrl,
}: PenPreviewArtProps) {
  const { transform, padX, padY, area, layout, centerX, centerY } = useMemo(() => {
    const [origin, along, , across] = photo.quad;
    const u = [along[0] - origin[0], along[1] - origin[1]];
    const v = [across[0] - origin[0], across[1] - origin[1]];
    const width = Math.hypot(u[0], u[1]);
    const height = Math.hypot(v[0], v[1]);
    const insetX = width * photo.inset;
    const insetY = height * photo.inset;
    const usable = {
      width: width - insetX * 2,
      height: height - insetY * 2,
    };
    return {
      transform: [
        u[0] / width,
        u[1] / width,
        v[0] / height,
        v[1] / height,
        origin[0],
        origin[1],
      ]
        .map((value) => Number(value.toFixed(5)))
        .join(" "),
      padX: insetX,
      padY: insetY,
      area: usable,
      centerX: width / 2,
      centerY: height / 2,
      layout: layoutEngraving(text, usable, {
        maxFontSize: height * photo.maxTextScale,
        maxLines: photo.maxLines,
      }),
    };
  }, [photo.quad, photo.inset, photo.maxTextScale, photo.maxLines, text]);

  return (
    <svg
      className="pen-photo-art"
      viewBox={`0 0 ${photo.width} ${photo.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={`matrix(${transform})`}>
        {logoDataUrl ? (
          <image
            href={logoDataUrl}
            x={padX}
            y={padY}
            width={area.width}
            height={area.height}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.92}
          />
        ) : (
          lineOffsets(layout).map((offset, index) => (
            <text
              key={`${index}:${layout.lines[index]}`}
              x={centerX}
              y={centerY + offset}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={fontStack}
              fontSize={layout.fontSize}
              fontWeight={bold ? 700 : 500}
              fontStyle={italic ? "italic" : "normal"}
              fill={photo.color}
            >
              {layout.lines[index]}
            </text>
          ))
        )}
      </g>
    </svg>
  );
}
