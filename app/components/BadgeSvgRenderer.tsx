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
import type { Badge } from "~/types/badge";

type Props = {
  badge: any;
  templateId: string;
  /** Pass "sign" when rendering sign designer so the correct template set is loaded. */
  variant?: DesignerVariant;
  actualSize?: boolean;
  className?: string;
  /** When set, overrides the default 280px wrapper height. Use "100%" to fill the parent. */
  height?: number | "100%";
};

/** Ms to wait after the last badge-only change before rebuilding SVG (coalesces rapid typing). */
const PREVIEW_DEBOUNCE_MS = 72;

const PLAQUE_LOGO_DATA_URL_CACHE_MAX = 40;

/**
 * Plaque preview is drawn as <img src="data:image/svg+xml,..."> so wood filters match the
 * template picker. In that mode browsers block most cross-origin <image href="https://...">
 * inside the SVG, so we embed the plate logo as a data URL first (sign preview uses inline SVG — no issue).
 */
async function badgeWithPlaqueLogoInlinedForSvgImg(
  badge: Badge,
  cache: Map<string, string>,
): Promise<Badge> {
  const raw = badge.logo?.src?.trim();
  if (!raw || raw.startsWith("data:") || !/^https?:\/\//i.test(raw)) {
    return badge;
  }
  const hit = cache.get(raw);
  if (hit) {
    return {
      ...badge,
      logo: badge.logo ? { ...badge.logo, src: hit } : badge.logo,
    };
  }
  try {
    const res = await fetch(raw, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("FileReader failed"));
      fr.readAsDataURL(blob);
    });
    cache.set(raw, dataUrl);
    while (cache.size > PLAQUE_LOGO_DATA_URL_CACHE_MAX) {
      const first = cache.keys().next().value as string | undefined;
      if (!first) break;
      cache.delete(first);
    }
    return {
      ...badge,
      logo: badge.logo ? { ...badge.logo, src: dataUrl } : badge.logo,
    };
  } catch (e) {
    console.warn("[BadgeSvgRenderer] Could not inline plaque logo for SVG-as-img preview:", e);
    return badge;
  }
}

export default function BadgeSvgRenderer({ badge, templateId, variant = "badge", actualSize = false, className, height }: Props) {
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
  badgeRef.current = badge;
  templateIdRef.current = templateId;
  variantRef.current = variant;

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
          const bRender =
            isPlaque
              ? await badgeWithPlaqueLogoInlinedForSvgImg(
                  b as Badge,
                  plaqueLogoCacheRef.current,
                )
              : b;
          const baseOpts = isPlaque
            ? SIGN_LIKE_TEMPLATE_THUMB_RENDER_OPTS
            : { showOutline: true as const };
          const s = await renderBadgeToSvgStringWithFonts(bRender, template, {
            ...baseOpts,
            svgDefScopeId: svgDefScopeRef.current,
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
  }, [badge, templateId, variant, actualSize]);

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
        height: height === "100%" ? "100%" : (height ?? 280),
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