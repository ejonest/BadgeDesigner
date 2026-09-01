import * as React from "react";
import { loadTemplateById } from "~/utils/templates";
import { renderBadgeToSvgStringWithFonts } from "~/utils/renderSvg";
import {
  type DesignerVariant,
  getSignTemplateUiContentScale,
  isSignLikeVariant,
  SIGN_LIKE_TEMPLATE_THUMB_RENDER_OPTS,
} from "~/constants/designerVariants";
import { isPlaqueTemplateId } from "~/utils/plaqueRender";
import { svgMarkupToImageSrc } from "~/utils/svgDataUrl";
import { badgeWithPlaqueLogoInlinedForSvgImg } from "~/utils/plaqueLogoInline";
import type { Badge } from "~/types/badge";
import type { ResolvedBlankBadgePhoto } from "~/utils/badgeBlankPhotos";

type Props = {
  badge: any;
  templateId: string;
  /** Pass "sign" when rendering sign designer so the correct template set is loaded. */
  variant?: DesignerVariant;
  actualSize?: boolean;
  className?: string;
  /** When set, overrides the default 280px wrapper height. Use "100%" to fill the parent. */
  height?: number | "100%";
  /** Dev/calibration: render with in-progress photo bounds instead of saved config. */
  photoPlateOverride?: ResolvedBlankBadgePhoto;
  /** Acrylic desk signs: project the artwork onto a plate photo instead of the flat plate. */
  deskSignPhotoMockup?: boolean;
};

/** Ms to wait after the last badge-only change before rebuilding SVG (coalesces rapid typing). */
const PREVIEW_DEBOUNCE_MS = 72;

/** Grid + column previews scale the SVG down; non-scaling stroke keeps the die edge readable. */
const BADGE_LIKE_PREVIEW_RENDER_OPTS = {
  showOutline: true as const,
  outlineStrokeWidth: "0.5",
  outlineNonScalingStroke: true as const,
};

export default function BadgeSvgRenderer({
  badge,
  templateId,
  variant = "badge",
  actualSize = false,
  className,
  height,
  photoPlateOverride,
  deskSignPhotoMockup = false,
}: Props) {
  const [svg, setSvg] = React.useState<string>("");
  const [plaqueImgSrc, setPlaqueImgSrc] = React.useState<string | null>(null);
  const plaqueLogoCacheRef = React.useRef<Map<string, string>>(new Map());
  /** One scope per mounted preview so clipPath / linearGradient ids never collide across parallel inline SVGs. */
  const svgDefScopeRef = React.useRef<string>("");
  if (!svgDefScopeRef.current) {
    svgDefScopeRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  const badgeRef = React.useRef(badge);
  const templateIdRef = React.useRef(templateId);
  const variantRef = React.useRef(variant);
  const photoPlateOverrideRef = React.useRef(photoPlateOverride);
  const deskSignPhotoMockupRef = React.useRef(deskSignPhotoMockup);
  badgeRef.current = badge;
  templateIdRef.current = templateId;
  variantRef.current = variant;
  photoPlateOverrideRef.current = photoPlateOverride;
  deskSignPhotoMockupRef.current = deskSignPhotoMockup;

  const firstPaintRef = React.useRef(true);
  const structuralRef = React.useRef({
    templateId,
    variant,
    actualSize,
  });

  React.useEffect(() => {
    let cancelled = false;

    const prev = structuralRef.current;
    const structuralChanged =
      prev.templateId !== templateId ||
      prev.variant !== variant ||
      prev.actualSize !== actualSize;
    structuralRef.current = { templateId, variant, actualSize };

    const delayMs =
      firstPaintRef.current || structuralChanged ? 0 : PREVIEW_DEBOUNCE_MS;
    firstPaintRef.current = false;

    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const tid = templateIdRef.current;
          const v = variantRef.current;
          const b = badgeRef.current;

          const template = await loadTemplateById(tid, v);
          if (!template) {
            console.error("Template not found:", tid);
            return;
          }

          const isPlaque = isPlaqueTemplateId(template.id);
          const bRender = isPlaque
            ? await badgeWithPlaqueLogoInlinedForSvgImg(
                b as Badge,
                plaqueLogoCacheRef.current,
              )
            : b;
          const baseOpts = isPlaque
            ? SIGN_LIKE_TEMPLATE_THUMB_RENDER_OPTS
            : BADGE_LIKE_PREVIEW_RENDER_OPTS;
          const s = await renderBadgeToSvgStringWithFonts(bRender, template, {
            ...baseOpts,
            svgDefScopeId: svgDefScopeRef.current,
            plateRenderMode: v === "badge" ? "photo" : "vector",
            ...(v === "badge"
              ? { showOutline: false, aqbPresetTextLayout: true }
              : v === "desk-sign"
                ? {
                    aqbPresetTextLayout: true,
                    previewPaddingPx: 0,
                    deskSignPhotoMockup: deskSignPhotoMockupRef.current,
                  }
              : {}),
            ...(photoPlateOverrideRef.current
              ? { photoPlateOverride: photoPlateOverrideRef.current }
              : {}),
          });

          if (!cancelled) {
            if (isPlaque) {
              setPlaqueImgSrc(svgMarkupToImageSrc(s));
              setSvg("");
            } else {
              setPlaqueImgSrc(null);
              setSvg(s);
            }
          }
        } catch (error) {
          console.error("Error loading template:", error);
        }
      })();
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    badge,
    templateId,
    variant,
    actualSize,
    photoPlateOverride,
    deskSignPhotoMockup,
  ]);

  const signUiScale = isSignLikeVariant(variant)
    ? getSignTemplateUiContentScale(templateId)
    : 1;

  // Sparse-plate sign templates use signUiScale > 1 for legibility. Scaling the outer box
  // grows past the preview bounds; instead shrink layout by 1/s then scale(s) so the
  // painted result still fits the same window as other sizes.
  const scaledInnerStyle: React.CSSProperties =
    signUiScale !== 1
      ? {
          width: `calc(100% / ${signUiScale})`,
          height: `calc(100% / ${signUiScale})`,
          transform: `scale(${signUiScale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }
      : {
          width: "100%",
          height: "100%",
        };

  return (
    <div
      key={`badge-render-${templateId}`}
      className={`w-full min-h-0 min-w-0 ${className || ""}`}
      style={{
        height: height === "100%" ? "100%" : height ?? 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-center min-h-0 min-w-0"
        style={scaledInnerStyle}
      >
        {plaqueImgSrc ? (
          <img
            src={plaqueImgSrc}
            alt=""
            className="max-h-full max-w-full object-contain block"
            style={{ width: "auto", height: "auto" }}
          />
        ) : (
          <div
            className="w-full h-full min-h-0 min-w-0 [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </div>
  );
}
