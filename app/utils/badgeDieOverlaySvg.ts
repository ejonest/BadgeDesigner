/**
 * Prepare a badge die SVG for the photo calibration overlay:
 * hide filled Outline shapes, show only Inner as a visible stroke.
 */
export function badgeDieOverlaySvgMarkup(rawSvg: string): string {
  const styleInject = `<style type="text/css"><![CDATA[
    #Outline, [id="Outline"] { display: none !important; visibility: hidden !important; }
    #Inner, [id="Inner"] {
      fill: none !important;
      stroke: #2563eb !important;
      stroke-width: 8 !important;
      vector-effect: non-scaling-stroke;
    }
  ]]></style>`;

  let svg = rawSvg.trim();
  if (!/<svg/i.test(svg)) return svg;

  svg = svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/gi, "")
      .replace(/\sheight="[^"]*"/gi, "");
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${styleInject}`;
  });

  return svg;
}
