// Proper badge renderer - the SVG IS the badge shape, not a rectangle containing it
import type { Badge, Template, RenderOpts } from '../types/badge-canonical';

const DPI = 96;

/**
 * Renders badge where the SVG viewport IS the badge shape
 * No rectangular container - the outline IS the interactive area
 */
export function renderBadgeToSvg(badge: Badge, template: Template, opts: RenderOpts = {}): string {
  // Get the bounding box of the inner path to determine viewBox
  const { x, y, width, height } = getPathBounds(template.innerPathSvg);
  
  // Generate unique clip ID
  const clipId = `badge-clip-${badge.id || 'anon'}`;
  
  // Render background layer (fills the shape)
  const bgLayer = renderBackgroundLayer(badge, template, x, y, width, height);
  
  // Render text layers (positioned within the shape)
  const textLayers = renderTextLayers(badge, template, x, y, width, height);
  
  // Render logo layer (within the shape)
  const logoLayer = renderLogoLayer(badge, template, x, y, width, height);
  
  // Assemble SVG where the viewBox is the badge shape bounds
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="${x} ${y} ${width} ${height}"
     preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${template.innerPathSvg}
    </clipPath>
  </defs>
  
  <!-- Background fills the shape -->
  <g clip-path="url(#${clipId})">
    ${bgLayer}
    ${logoLayer}
    ${textLayers}
  </g>
  
  <!-- Outline IS the interactive area -->
  ${template.outlinePathSvg ? template.outlinePathSvg : template.innerPathSvg}
</svg>`.trim();
}

function getPathBounds(pathSvg: string): { x: number; y: number; width: number; height: number } {
  // Parse the path to get its bounds
  // For now, use a simple approach - extract from common patterns
  
  if (pathSvg.includes('rect-1x3')) {
    // Rectangle 3x1 inch = 288x96px
    return { x: 0, y: 0, width: 288, height: 96 };
  } else if (pathSvg.includes('rect-1x3_5')) {
    // Rectangle 3.5x1 inch = 336x96px  
    return { x: 0, y: 0, width: 336, height: 96 };
  } else if (pathSvg.includes('oval')) {
    // Oval - extract from ellipse or use bounds
    return { x: 0, y: 0, width: 336, height: 96 };
  } else if (pathSvg.includes('house')) {
    // House shape - extract from path
    return { x: 0, y: 0, width: 96, height: 336 };
  }
  
  // Default fallback
  return { x: 0, y: 0, width: 288, height: 96 };
}

function renderBackgroundLayer(badge: Badge, template: Template, x: number, y: number, width: number, height: number): string {
  if (badge.backgroundImage) {
    // Render background image
    const img = badge.backgroundImage;
    return `<image
      href="${img.src}"
      x="${x + img.xPx}" y="${y + img.yPx}"
      width="${img.wPx}" height="${img.hPx}"
      preserveAspectRatio="${img.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"
      style="image-rendering:optimizeQuality"
    />`;
  } else {
    // Render background color - fill the entire shape bounds
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${badge.backgroundColor}" />`;
  }
}

function renderTextLayers(badge: Badge, template: Template, x: number, y: number, width: number, height: number): string {
  return badge.lines.map((line, index) => {
    const anchor = line.align === 'center' ? 'middle' : 
                   line.align === 'right' ? 'end' : 'start';
    
    return `<text
      x="${x + line.xPx}" y="${y + line.yPx}"
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

function renderLogoLayer(badge: Badge, template: Template, x: number, y: number, width: number, height: number): string {
  if (!badge.logo) return '';
  
  const logo = badge.logo;
  return `<image
    href="${logo.src}"
    x="${x + logo.xPx}" y="${y + logo.yPx}"
    width="${logo.wPx}" height="${logo.hPx}"
    preserveAspectRatio="xMidYMid meet"
    style="image-rendering:optimizeQuality"
  />`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
