import * as React from "react";
import { loadTemplateById } from "~/utils/templates";
import { renderBadgeToSvgStringWithFonts } from "~/utils/renderSvg";
import type { LoadedTemplate } from "~/utils/templates";
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

export default function BadgeSvgRenderer({ badge, templateId, variant = "badge", actualSize = false, className, height }: Props) {
  const [svg, setSvg] = React.useState<string>("");
  const [renderKey, setRenderKey] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    // Force fresh render by incrementing key
    setRenderKey(prev => prev + 1);
    (async () => {
      try {
        const template = await loadTemplateById(templateId, variant);
        if (!template) {
          console.error('Template not found:', templateId);
          return;
        }
        
        // Use font-embedding version for consistent font rendering
        const s = await renderBadgeToSvgStringWithFonts(badge, template, { showOutline: true });
        
        if (on) {
          setSvg(s);
        }
      } catch (error) {
        console.error('Error loading template:', error);
      }
    })();
    return () => { on = false; };
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
      key={`badge-render-${templateId}-${renderKey}`}
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