import * as React from "react";
import { loadTemplateById } from "~/utils/templates";
import { renderBadgeToSvgStringWithFonts } from "~/utils/renderSvg";
import type { LoadedTemplate } from "~/utils/templates";

type Props = { badge: any; templateId: string; actualSize?: boolean; className?: string };

export default function BadgeSvgRenderer({ badge, templateId, actualSize = false, className }: Props) {
  const [svg, setSvg] = React.useState<string>("");
  const [renderKey, setRenderKey] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    // Force fresh render by incrementing key
    setRenderKey(prev => prev + 1);
    (async () => {
      try {
        const template = await loadTemplateById(templateId);
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
  }, [badge, templateId, actualSize]);

  return (
    <div
      key={`badge-render-${templateId}-${renderKey}`}
      className={`w-full ${className || ""}`}
      style={{ 
        height: 280, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        overflow: "visible"
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}