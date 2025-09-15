// src/components/BadgeSvgRenderer.tsx
import React, { useMemo } from "react";
import type { Badge } from "../types/badge";
import type { LoadedTemplate } from "../../app/utils/templates";
import { renderBadgeToSvgString } from "../../app/utils/renderSvg";

type Props = { badge: Badge; template: LoadedTemplate; debug?: boolean };

export function BadgeSvgRenderer({ badge, template, debug }: Props) {
  const svgString = useMemo(() => {
    try {
      return renderBadgeToSvgString(badge, template, { showOutline: true });
    } catch (err) {
      console.error("[BadgeSvgRenderer] render error", err);
      return `<svg width="${template.widthPx}" height="${template.heightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fee2e2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#b91c1c" font-family="monospace" font-size="12">Render error</text></svg>`;
    }
  }, [badge, template]);

  return (
    <div className="badge-renderer" style={{ overflow: "hidden" }}>
      <div
        dangerouslySetInnerHTML={{ __html: svgString }}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {debug && (
        <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
          {JSON.stringify({
            templateId: badge.templateId,
            templateName: template.name,
            dimensions: { w: template.widthPx, h: template.heightPx },
            safeInset: template.safeInsetPx,
            hasInnerElement: !!template.innerElement,
            hasOutlineElement: !!template.outlineElement,
            lines: badge.lines?.length ?? 0,
            hasBgImg: !!badge.backgroundImage && typeof badge.backgroundImage === "object",
            hasLogo: !!badge.logo && typeof badge.logo === "object"
          }, null, 2)}
        </pre>
      )}
    </div>
  );
}