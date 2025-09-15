import * as React from "react";
import { loadTemplateById } from "~/utils/templates";
import { renderBadgeToSvgString } from "~/utils/renderSvg";

type Props = { badge: any; templateId: string; actualSize?: boolean; className?: string };

export default function BadgeSvgRenderer({ badge, templateId, actualSize = false, className }: Props) {
  const [svg, setSvg] = React.useState<string>("");

  React.useEffect(() => {
    let on = true;
    (async () => {
      const tpl = await loadTemplateById(templateId);
      // pass a flag to add/remove debug safely during testing
      const s = renderBadgeToSvgString(badge, tpl, { showOutline: true });
      if (on) setSvg(s.replace(
        // make root <svg> responsive or fixed 1:1 depending on actualSize
        /<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*>/,
        (_m, w, h) =>
          actualSize
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`
      ));
    })();
    return () => { on = false; };
  }, [badge, templateId, actualSize]);

  return (
    <div
      className={`w-full ${className || ""}`}
      style={{ height: 280, display: "grid", placeItems: "center", overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}