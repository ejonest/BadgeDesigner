// Single rendering kernel - the only source of SVG output
import type { Badge, Template, RenderOpts } from '../types/badge-canonical';

const DPI = 96;

/**
 * The single rendering function - all preview and exports call this
 */
export function renderBadgeToSvg(badge: Badge, template: Template, opts: RenderOpts = {}): string {
  // Calculate physical dimensions in pixels
  const widthPx = Math.round(template.widthIn * DPI);
  const heightPx = Math.round(template.heightIn * DPI);
  
  // Generate unique clip ID
  const clipId = `badge-clip-${badge.id || 'anon'}`;
  
  // Render background layer
  const bgLayer = renderBackgroundLayer(badge, template);
  
  // Render text layers
  const textLayers = renderTextLayers(badge, template);
  
  // Render logo layer
  const logoLayer = renderLogoLayer(badge, template);
  
  // Render outline (always last)
  const outlineLayer = renderOutlineLayer(template, opts);
  
  // Assemble complete SVG
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${widthPx}" height="${heightPx}"
     viewBox="0 0 ${widthPx} ${heightPx}"
     preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${template.innerPathSvg}
    </clipPath>
  </defs>
  
  <!-- Clipped content group -->
  <g clip-path="url(#${clipId})">
    ${bgLayer}
    ${logoLayer}
    ${textLayers}
  </g>
  
  <!-- Outline always on top -->
  ${outlineLayer}
</svg>`.trim();
}

function renderBackgroundLayer(badge: Badge, template: Template): string {
  const widthPx = Math.round(template.widthIn * DPI);
  const heightPx = Math.round(template.heightIn * DPI);
  
  if (badge.backgroundImage) {
    // Render background image
    const img = badge.backgroundImage;
    return `<image
      href="${img.src}"
      x="${img.xPx}" y="${img.yPx}"
      width="${img.wPx}" height="${img.hPx}"
      preserveAspectRatio="${img.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"
      style="image-rendering:optimizeQuality"
    />`;
  } else {
    // Render background color
    return `<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="${badge.backgroundColor}" />`;
  }
}

function renderTextLayers(badge: Badge, template: Template): string {
  return badge.lines.map((line, index) => {
    const anchor = line.align === 'center' ? 'middle' : 
                   line.align === 'right' ? 'end' : 'start';
    
    return `<text
      x="${line.xPx}" y="${line.yPx}"
      font-size="${line.fontSizePx}"
      text-anchor="${anchor}"
      alignment-baseline="middle"
      font-family="${escapeXml(line.fontFamily)}"
      fill="${line.color}"
      font-weight="${line.bold ? 'bold' : 'normal'}"
      font-style="${line.italic ? 'italic' : 'normal'}"
    >${escapeXml(line.text)}</text>`;
  }).join('\n    ');
}

function renderLogoLayer(badge: Badge, template: Template): string {
  if (!badge.logo) return '';
  
  const logo = badge.logo;
  return `<image
    href="${logo.src}"
    x="${logo.xPx}" y="${logo.yPx}"
    width="${logo.wPx}" height="${logo.hPx}"
    preserveAspectRatio="xMidYMid meet"
    style="image-rendering:optimizeQuality"
  />`;
}

function renderOutlineLayer(template: Template, opts: RenderOpts): string {
  if (!opts.showOutline) return '';
  
  const outlineElement = template.outlinePathSvg || template.innerPathSvg;
  return outlineElement.replace(/\/?>$/, ' fill="none" stroke="#222" stroke-width="1.25"/>');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
