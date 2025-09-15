// app/utils/renderSvg.ts
import type { LoadedTemplate } from "~/utils/templates";
import type { Badge, BadgeImage } from "../../src/types/badge";

type RenderOpts = { showOutline?: boolean };

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type AnyLine = {
  id?: string;
  text?: string;
  x?: number; y?: number;        // legacy absolute px
  xPx?: number; yPx?: number;    // absolute px alt
  xNorm?: number; yNorm?: number;// 0..1 normalized within designBox
  fontSize?: number; fontSizeRel?: number; // absolute px OR relative to designBox.height
  color?: string; bold?: boolean; italic?: boolean; fontFamily?: string;
  align?: "left"|"center"|"right";
};

function toPx(line: AnyLine, designBox: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  // Prefer absolute when available (back-compat)
  if (line.xPx != null || line.yPx != null || line.x != null || line.y != null) {
    return { x: line.xPx ?? line.x ?? 0, y: line.yPx ?? line.y ?? 0 };
  }
  // Otherwise use normalized (center-ish defaults)
  const xn = line.xNorm ?? 0.5;
  const yn = line.yNorm ?? 0.6;
  return { 
    x: designBox.x + xn * designBox.width, 
    y: designBox.y + yn * designBox.height 
  };
}

// TEMP: force BG image sizing to prove rendering path works
const FORCE_BG_SIZE_DEBUG = true;

function renderBg(img: BadgeImage | undefined, designBox: { x: number; y: number; width: number; height: number }): string {
  if (!img || !img.src) {
    // visible placeholder so we know the code path ran
    return `<rect x="${designBox.x}" y="${designBox.y}" width="${designBox.width}" height="${designBox.height}" fill="#ffe8e8"/>`;
  }

  // Hard override while debugging: force the image to cover the whole designBox
  const iw = FORCE_BG_SIZE_DEBUG ? designBox.width : Math.max(1, img.widthPx ?? designBox.width);
  const ih = FORCE_BG_SIZE_DEBUG ? designBox.height : Math.max(1, img.heightPx ?? designBox.height);
  const scale = FORCE_BG_SIZE_DEBUG ? 1 : (img.scale ?? 1);
  const offX  = img.offsetX ?? 0;
  const offY  = img.offsetY ?? 0;

  // Center the image within the designBox
  const centerX = designBox.x + designBox.width / 2;
  const centerY = designBox.y + designBox.height / 2;
  const transform = `translate(${centerX + offX}, ${centerY + offY}) translate(${iw/2}, ${ih/2}) scale(${scale}) translate(${-iw/2}, ${-ih/2})`;

  // Emit BOTH href and xlink:href for maximum compatibility
  return `
    <g transform="${transform}">
      <image
        href="${img.src}"
        xlink:href="${img.src}"
        x="0" y="0" width="${iw}" height="${ih}"
        preserveAspectRatio="xMidYMid slice"
        style="image-rendering:optimizeQuality"
      />
    </g>
  `;
}

function renderLogo(logo: BadgeImage | undefined, designBox: { x: number; y: number; width: number; height: number }): string {
  if (!logo) return "";
  const lw = Math.max(1, logo.widthPx ?? Math.round(designBox.height * 0.3));
  const lh = Math.max(1, logo.heightPx ?? Math.round(designBox.height * 0.3));
  
  // Default logo position: 10% from left, 20% from top of designBox
  const x = logo.x ?? (designBox.x + designBox.width * 0.1);
  const y = logo.y ?? (designBox.y + designBox.height * 0.2);
  const s = logo.scale ?? 1;

  return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <image href="${logo.src}" x="0" y="0" width="${lw}" height="${lh}" preserveAspectRatio="none"
             style="image-rendering:optimizeQuality" />
    </g>
  `;
}

export function renderBadgeToSvgString(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {}
): string {
  const DISABLE_CLIP_DEBUG = true; // set to true to bypass clipping temporarily

  const W = template.widthPx;
  const H = template.heightPx;
  const designBox = template.designBox;

  const clipId = `clip-${badge.id || "anon"}`;

  const clippedOpen = DISABLE_CLIP_DEBUG
    ? `<g>`
    : `<g clip-path="url(#${clipId})">`;

  const safeGuide = ""; // Remove safe guide for now - focus on designBox

  const bgLayer = badge.backgroundImage
    ? renderBg(badge.backgroundImage, designBox)
    : `<rect x="${designBox.x}" y="${designBox.y}" width="${designBox.width}" height="${designBox.height}" fill="${badge.backgroundColor || "#FFFFFF"}" />`;

  const debugCross =
    opts.showOutline
      ? `<g stroke="#f66" stroke-dasharray="4 4" stroke-width="0.8" opacity="0.45">
           <line x1="${designBox.x + designBox.width/2}" y1="${designBox.y}" x2="${designBox.x + designBox.width/2}" y2="${designBox.y + designBox.height}" />
           <line x1="${designBox.x}" y1="${designBox.y + designBox.height/2}" x2="${designBox.x + designBox.width}" y2="${designBox.y + designBox.height/2}" />
         </g>`
      : "";

  const textDots = (badge.lines || []).map((ln: AnyLine) => {
    const p = toPx(ln, designBox);
    return `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="#f66" opacity="0.75"/>`;
  }).join("");

  console.log("[lines]", badge.lines);

const text = (badge.lines || []).map((line: any, i: number) => {
  const { x, y } = toPx(line, designBox);
  const size = line.fontSizeRel ? Math.round(line.fontSizeRel * designBox.height) : 
               line.fontSize ?? Math.round(designBox.height * (i === 0 ? 0.23 : 0.17));
  const anchor =
    line.align === "center" ? "middle" :
    line.align === "right"  ? "end"    : "start";
  const family = esc(line.fontFamily || "Inter, ui-sans-serif, system-ui");
  const color  = line.color || "#000";
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}"
                font-family="${family}" fill="${color}"
                font-weight="${line.bold ? "bold" : "normal"}"
                font-style="${line.italic ? "italic" : "normal"}">${esc(line.text || "")}</text>`;
}).join("");

  const outline = (() => {
    if (!opts.showOutline) return "";
    
    if (template.outlineElement) {
      // Use dedicated outline element if available
      return template.outlineElement.replace(/\/?>$/, ' fill="none" stroke="#222" stroke-width="1.25"/>');
    } else {
      // Fallback: use inner element with stroke
      return template.innerElement.replace(/\/?>$/, ' fill="none" stroke="#222" stroke-width="1.25"/>');
    }
  })();

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  return `${svgOpen}
  <defs>
    <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${template.outlineElement || template.innerElement}
    </clipPath>
  </defs>

  ${safeGuide}

  ${debugCross}

  ${clippedOpen}
    ${bgLayer}                      <!-- background first -->
    ${renderLogo(badge.logo, designBox)}       <!-- then logo -->
    ${text}                         <!-- text last, on top -->
  </g>

  ${textDots}

  <!-- Draw the badge outline as a visible stroke -->
  ${template.outlineElement ? 
    template.outlineElement.replace(/\/?>$/, ' fill="none" stroke="#111" stroke-width="1.25"/>') :
    template.innerElement.replace(/\/?>$/, ' fill="none" stroke="#111" stroke-width="1.25"/>')
  }
</svg>`.trim();
}
