import { useEffect, useMemo, useRef, useState } from "react";

import type { PenPreviewPhoto } from "~/constants/pen";
import { inkTintMatrix } from "~/utils/logoBlackInk";
import {
  fitMeasuredWidth,
  layoutEngraving,
  lineOffsets,
  penLockup,
  type EngravingLayout,
} from "~/utils/penEngraving";
import { paintCylindricalEngraving } from "~/utils/penPreviewPaint";
import type { PenLogoInk } from "~/utils/penRender";

interface PenPreviewArtProps {
  photo: PenPreviewPhoto;
  text: string;
  fontStack: string;
  bold: boolean;
  italic: boolean;
  logo?: PenLogoInk | null;
}

/**
 * Draws the customer's artwork onto a product photo.
 *
 * The overlay uses the photo's own pixel coordinates, so it scales with the
 * photo instead of the surrounding layout. Planar surfaces (the case band)
 * get an affine SVG map. The cap is painted as a shallow cylindrical
 * engraving so the letters wrap and catch light like the real pen.
 *
 * An uploaded logo arrives already reduced to single-colour art and is placed
 * against the message the way that surface's lockup sits, tinted to whatever
 * colour it engraves in.
 */
export function PenPreviewArt(props: PenPreviewArtProps) {
  return props.photo.warp === "cylinder" ? (
    <CylinderEngraving {...props} />
  ) : (
    <PlanarEngraving {...props} />
  );
}

function PlanarEngraving({
  photo,
  text,
  fontStack,
  bold,
  italic,
  logo,
}: PenPreviewArtProps) {
  const planar = useMemo(() => {
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
    const lockup = penLockup(usable, {
      logoAspect: logo?.aspect,
      hasText: Boolean(text.trim()),
      placement: photo.logoPlacement,
    });
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
      logo: lockup.logo,
      textWidth: lockup.text.width,
      centerX: insetX + lockup.text.x + lockup.text.width / 2,
      centerY: insetY + lockup.text.y + lockup.text.height / 2,
      layout: layoutEngraving(
        text,
        { width: lockup.text.width, height: lockup.text.height },
        {
          maxFontSize: height * photo.maxTextScale,
          maxLines: photo.maxLines,
        },
      ),
    };
  }, [
    photo.quad,
    photo.inset,
    photo.maxTextScale,
    photo.maxLines,
    photo.logoPlacement,
    text,
    logo?.aspect,
  ]);

  const layout = useMeasuredLayout(
    planar.layout,
    planar.textWidth * 0.98,
    fontStack,
    bold,
    italic,
  );

  return (
    <svg
      className="pen-photo-art is-etched"
      viewBox={`0 0 ${photo.width} ${photo.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="pen-preview-safe-area">
          <rect
            x={planar.padX}
            y={planar.padY}
            width={planar.area.width}
            height={planar.area.height}
          />
        </clipPath>
        {/* The art is black; the surface decides what colour it engraves in. */}
        <filter id="pen-preview-ink" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={inkTintMatrix(photo.color)} />
        </filter>
      </defs>
      <g
        transform={`matrix(${planar.transform})`}
        clipPath="url(#pen-preview-safe-area)"
      >
        {logo && planar.logo && (
          <image
            href={logo.href}
            x={planar.padX + planar.logo.x}
            y={planar.padY + planar.logo.y}
            width={planar.logo.width}
            height={planar.logo.height}
            preserveAspectRatio="xMidYMid meet"
            filter="url(#pen-preview-ink)"
          />
        )}
        {lineOffsets(layout).map((offset, index) => (
          <text
            key={`${index}:${layout.lines[index]}`}
            x={planar.centerX}
            y={planar.centerY + offset}
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
        ))}
      </g>
    </svg>
  );
}

/**
 * The estimated layout, corrected to what the chosen webfont really measures
 * so the preview matches the production file and never runs past the plate.
 *
 * Measuring has to wait for the font to load, so the estimate shows for a
 * frame and the correction lands after; until then the layout is returned
 * unchanged rather than scaled by a stale factor for different text.
 */
function useMeasuredLayout(
  layout: EngravingLayout,
  maxWidth: number,
  fontStack: string,
  bold: boolean,
  italic: boolean,
): EngravingLayout {
  const fontAt = (fontSize: number) =>
    `${italic ? "italic" : "normal"} ${bold ? 700 : 500} ${fontSize}px ${fontStack}`;
  const key = `${fontAt(layout.fontSize)}|${maxWidth}|${layout.lines.join("\n")}`;
  const [fitted, setFitted] = useState<{ key: string; scale: number }>({
    key: "",
    scale: 1,
  });

  useEffect(() => {
    let active = true;
    const measure = async () => {
      try {
        await document.fonts.load(fontAt(layout.fontSize));
      } catch {
        // System fallbacks still measure.
      }
      const context = document.createElement("canvas").getContext("2d");
      if (!context || !active) return;
      const next = fitMeasuredWidth(layout, maxWidth, (line, fontSize) => {
        context.font = fontAt(fontSize);
        return context.measureText(line).width;
      });
      setFitted({ key, scale: next.fontSize / layout.fontSize });
    };
    measure();
    return () => {
      active = false;
    };
    // `key` covers every input the measurement depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (fitted.key !== key || fitted.scale === 1) return layout;
  return {
    ...layout,
    fontSize: layout.fontSize * fitted.scale,
    lineSpacing: layout.lineSpacing * fitted.scale,
  };
}

function CylinderEngraving({
  photo,
  text,
  fontStack,
  bold,
  italic,
  logo,
}: PenPreviewArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const paint = () => {
      paintCylindricalEngraving(canvas, {
        photo,
        text,
        fontStack,
        bold,
        italic,
        logo,
      }).catch(() => {
        if (cancelled) return;
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      });
    };

    // The backing store is sized from the laid-out box, so the engraving has
    // to be repainted whenever that box changes or it goes soft.
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [photo, text, fontStack, bold, italic, logo]);

  return (
    <canvas
      ref={canvasRef}
      className="pen-photo-art is-engraved"
      width={photo.width}
      height={photo.height}
      aria-hidden="true"
    />
  );
}
