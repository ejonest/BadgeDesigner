// app/utils/renderSvg.ts
import type { LoadedTemplate } from "~/utils/templates";
import type { Badge, BadgeImage } from "../types/badge";
import { loadFont } from "./fontLoader";

type RenderOpts = { showOutline?: boolean };

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type AnyLine = {
  id?: string;
  text?: string;
  // New normalized coordinates (preferred)
  xNorm?: number; yNorm?: number;// 0..1 normalized within designBox
  sizeNorm?: number; // 0..1 relative to designBox.height
  // Legacy absolute coordinates (for backward compatibility)
  x?: number; y?: number;        // legacy absolute px
  xPx?: number; yPx?: number;    // absolute px alt
  fontSize?: number; fontSizeRel?: number; // absolute px OR relative to designBox.height
  color?: string; bold?: boolean; italic?: boolean; fontFamily?: string;
  align?: "left"|"center"|"right";
};

function toPx(line: AnyLine, designBox: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  // Prefer normalized coordinates (new preferred method)
  if (line.xNorm != null && line.yNorm != null) {
    return { 
      x: designBox.x + line.xNorm * designBox.width, 
      y: designBox.y + line.yNorm * designBox.height 
    };
  }
  // Fallback to absolute coordinates (backward compatibility)
  if (line.xPx != null || line.yPx != null || line.x != null || line.y != null) {
    return { x: line.xPx ?? line.x ?? 0, y: line.yPx ?? line.y ?? 0 };
  }
  // Default to center if no coordinates provided
  return { 
    x: designBox.x + designBox.width * 0.5, 
    y: designBox.y + designBox.height * 0.6 
  };
}

// TEMP: force BG image sizing to prove rendering path works
const FORCE_BG_SIZE_DEBUG = false;

function renderBg(img: BadgeImage | undefined, designBox: { x: number; y: number; width: number; height: number }): string {
  if (!img || !img.src) {
    // No background image, return empty string (background color will be handled separately)
    return "";
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

/**
 * Remove fill/stroke attributes from all descendant SVG shapes
 * and apply correct display attributes.
 * Uses DOM parsing for robust attribute manipulation.
 */
function prepareElementForOutline(element: string, fill: string, stroke: string, strokeWidth: string): string {
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parser = new DOMParser();
    // Wrap element in a temporary container for parsing
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${element}</svg>`;
    const doc = parser.parseFromString(wrapped, "image/svg+xml");
    
    // Find all relevant SVG shape elements and update their attributes
    // This handles both direct elements and nested structures
    doc.querySelectorAll("[id='Inner'], [id='inner'], path, rect, ellipse, circle, polygon, polyline").forEach((el) => {
      el.removeAttribute("fill");
      el.removeAttribute("stroke");
      el.removeAttribute("stroke-width");
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", strokeWidth);
    });
    
    // Extract the inner element back out
    const svgEl = doc.documentElement;
    const output = svgEl.innerHTML;
    console.log('[prepareElementForOutline] Output:', output);
    return output;
  }
  
  // Fallback for SSR: use regex (less robust but works)
  let cleaned = element.replace(/\s+fill\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+stroke-width\s*=\s*["'][^"']*["']/gi, '');
  return cleaned.replace(/\/?>$/, ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
}

export function renderBadgeToSvgString(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {}
): string {
  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const PADDING_PX = 24;
  // Use standardized viewBox for consistent display (shows relative sizes between 1×3 and 1.5×3)
  const W = template.standardViewBoxWidth + (PADDING_PX * 2);
  const H = template.standardViewBoxHeight + (PADDING_PX * 2);
  const designBox = template.designBox;

  const clipId = `badge-clip-${badge.id || "anon"}`;

  // SINGLE LAYER APPROACH: Use inner path directly for background fill
  const innerPathWithFill = template.innerElement.replace(
    /fill="[^"]*"/,
    `fill="${badge.backgroundColor || "#FFFFFF"}"`
  );
  
  // Background image (if present)
  const bgImageLayer = badge.backgroundImage
    ? renderBg(badge.backgroundImage, designBox)
    : '';

  console.log("[renderSvg] designBox:", designBox);
  console.log("[renderSvg] backgroundColor:", badge.backgroundColor);

  // Text rendering
  const text = (badge.lines || []).map((line: any, i: number) => {
    const { x, y } = toPx(line, designBox);
    // Prefer sizeNorm (new normalized sizing)
    const size = line.sizeNorm ? Math.round(line.sizeNorm * designBox.height) :
                 line.fontSizeRel ? Math.round(line.fontSizeRel * designBox.height) : 
                 line.fontSize ?? Math.round(designBox.height * (i === 0 ? 0.23 : 0.17));
    // Fix alignment mapping: left -> start, right -> end, center -> middle
    const alignment = line.align || line.alignment || "center";
    const anchor =
      alignment === "center" ? "middle" :
      alignment === "right" ? "end" : "start";
    const family = esc(line.fontFamily || "Inter, ui-sans-serif, system-ui");
    const color  = line.color || "#000";
    return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}"
                  alignment-baseline="middle" font-family="${family}" fill="${color}"
                  font-weight="${line.bold ? "bold" : "normal"}"
                  font-style="${line.italic ? "italic" : "normal"}">${esc(line.text || "")}</text>`;
  }).join("");

  // Outline for border (no fill, stroke only)
  const outline = template.outlineElement 
    ? prepareElementForOutline(template.outlineElement, "none", "#111", "1.25")
    : prepareElementForOutline(template.innerElement, "none", "#111", "1.25");

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  return `${svgOpen}
  <defs>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPathWithFill}
    
    <!-- Background image (if present) -->
    ${bgImageLayer}
    
    <!-- Text on top of background -->
    ${text}
    
    <!-- Logo (if present) -->
    ${renderLogo(badge.logo, designBox)}
    
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}

// Async version that embeds fonts for consistent rendering across all export formats
export async function renderBadgeToSvgStringWithFonts(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {}
): Promise<string> {
  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const PADDING_PX = 24;
  // Use standardized viewBox for consistent display (shows relative sizes between 1×3 and 1.5×3)
  const W = template.standardViewBoxWidth + (PADDING_PX * 2);
  const H = template.standardViewBoxHeight + (PADDING_PX * 2);
  const designBox = template.designBox;

  const clipId = `badge-clip-${badge.id || "anon"}`;

  // Collect all unique font families used in the badge
  const fontFamilies = new Set<string>();
  (badge.lines || []).forEach(line => {
    if (line.fontFamily) {
      fontFamilies.add(line.fontFamily);
    }
  });

  // Load and embed fonts
  const fontDefs: string[] = [];
  const fontMappings = new Map<string, string>(); // original name -> embedded name

  for (const fontFamily of fontFamilies) {
    try {
      const fontData = await loadFont(fontFamily);
      if (fontData) {
        const embeddedName = `Embedded${fontFamily.replace(/\s+/g, '')}`;
        fontMappings.set(fontFamily, embeddedName);
        
        fontDefs.push(`
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: normal;
            font-style: normal;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: bold;
            font-style: normal;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: normal;
            font-style: italic;
          }
          @font-face {
            font-family: "${embeddedName}";
            src: url("data:font/ttf;base64,${fontData.regular}");
            font-weight: bold;
            font-style: italic;
          }
        `);
      }
    } catch (error) {
      console.warn(`Failed to load font ${fontFamily}:`, error);
    }
  }

  // SINGLE LAYER APPROACH: Use inner path directly for background fill
  // Replace the inner path's fill with the badge background color
  // This eliminates the separate rect and creates a single layer
  const innerPathWithFill = template.innerElement.replace(
    /fill="[^"]*"/,
    `fill="${badge.backgroundColor || "#FFFFFF"}"`
  );
  
  // Background image (if present) - rendered on top of filled inner path
  const bgImageLayer = badge.backgroundImage
    ? renderBg(badge.backgroundImage, designBox)
    : '';

  // Text rendering with embedded fonts
  const text = (badge.lines || []).map((line: any, i: number) => {
    const { x, y } = toPx(line, designBox);
    const size = line.sizeNorm ? Math.round(line.sizeNorm * designBox.height) :
                 line.fontSizeRel ? Math.round(line.fontSizeRel * designBox.height) : 
                 line.fontSize ?? Math.round(designBox.height * (i === 0 ? 0.23 : 0.17));
    // Fix alignment mapping: left -> start, right -> end, center -> middle
    const alignment = line.align || line.alignment || "center";
    const anchor =
      alignment === "center" ? "middle" :
      alignment === "right" ? "end" : "start";
    
    // Use embedded font name if available, otherwise fallback to original
    const originalFamily = line.fontFamily || "Inter, ui-sans-serif, system-ui";
    const embeddedFamily = fontMappings.get(originalFamily) || originalFamily;
    const family = esc(embeddedFamily);
    const color = line.color || "#000";
    
    return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}"
                  alignment-baseline="middle" font-family="${family}" fill="${color}"
                  font-weight="${line.bold ? "bold" : "normal"}"
                  font-style="${line.italic ? "italic" : "normal"}">${esc(line.text || "")}</text>`;
  }).join("");

  // Outline for border (no fill, stroke only)
  const outline = template.outlineElement 
    ? prepareElementForOutline(template.outlineElement, "none", "#111", "1.25")
    : prepareElementForOutline(template.innerElement, "none", "#111", "1.25");

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  return `${svgOpen}
  <defs>
    <style type="text/css">
      ${fontDefs.join('\n')}
    </style>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPathWithFill}
    
    <!-- Background image (if present) -->
    ${bgImageLayer}
    
    <!-- Text on top of background -->
    ${text}
    
    <!-- Logo (if present) -->
    ${renderLogo(badge.logo, designBox)}
    
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}
