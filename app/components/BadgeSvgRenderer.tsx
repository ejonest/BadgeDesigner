import * as React from "react";
import { loadTemplateById } from "~/utils/templates";
import { renderBadgeToSvgStringWithFonts } from "~/utils/renderSvg";
import {
  type DesignerVariant,
  getSignTemplateUiContentScale,
} from "~/constants/designerVariants";

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

export default function BadgeSvgRenderer({ badge, templateId, variant = "badge", actualSize = false, className, height }: Props) {
  const [svg, setSvg] = React.useState<string>("");

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

          const s = await renderBadgeToSvgStringWithFonts(b, template, {
            showOutline: true,
          });

          if (!cancelled) {
            setSvg(s);
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

  const signUiScale =
    variant === "sign" ? getSignTemplateUiContentScale(templateId) : 1;

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
        <div
          className="w-full h-full min-h-0 min-w-0 [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}