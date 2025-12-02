// app/utils/templates.ts
/**
 * Template Loading System - Loads directly from SVG files
 * 
 * NO CACHING - Templates are loaded fresh from SVG files on every request
 * to ensure changes to SVG files are immediately visible.
 */

import templatesJson from "../data/templates.local.json";

const DPI = 96;
const toPx = (inches: number) => Math.round(inches * DPI);

type TemplateConfig = {
  id: string;
  name: string;
  widthInches: number;
  heightInches: number;
  svgFile: string;
  safeInsetPx?: number;
};

export type LoadedTemplate = {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  safeInsetPx: number;
  // Store full element markup so we can support <path> or <ellipse>
  innerElement: string;    // REQUIRED (clip) - full HTML element like <path id="Inner" d="..." fill="#000"/>
  outlineElement?: string; // OPTIONAL (visible preview stroke) - full HTML element
  designBox: { x: number; y: number; width: number; height: number };
  // Standardized viewBox dimensions (same for all badges - shows relative sizes)
  standardViewBoxWidth: number;
  standardViewBoxHeight: number;
};

type TemplatesFile = { version: number; templates: TemplateConfig[] };

const cfg = (templatesJson as TemplatesFile).templates || [];

// NO CACHE - Load fresh from SVG files every time

/**
 * Extracts a path element from SVG content by ID.
 * Handles different attribute orders and case variations.
 */
function extractPathFromSvg(svgContent: string, pathId: string): string | null {
  // Create a DOM parser to reliably extract path data
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      
      // Try exact case first
      let path = doc.querySelector(`path[id="${pathId}"]`) || 
                 doc.querySelector(`path[id="${pathId.toLowerCase()}"]`) ||
                 doc.querySelector(`path[id="${pathId.toUpperCase()}"]`);
      
      if (path) {
        const d = path.getAttribute('d');
        if (d) {
          return d;
        }
      }
    } catch (e) {
      console.warn(`[templates] DOM parsing failed, falling back to regex:`, e);
    }
  }
  
  // Fallback to regex for SSR or if DOM parsing fails
  // Match path with id attribute (handles different attribute orders)
  const patterns = [
    // id="Inner" d="..."
    new RegExp(`<path[^>]*id=["']${pathId}["'][^>]*d=["']([^"']+)["']`, 'i'),
    // id="inner" d="..."
    new RegExp(`<path[^>]*id=["']${pathId.toLowerCase()}["'][^>]*d=["']([^"']+)["']`, 'i'),
    // d="..." id="Inner"
    new RegExp(`<path[^>]*d=["']([^"']+)["'][^>]*id=["']${pathId}["']`, 'i'),
    // d="..." id="inner"
    new RegExp(`<path[^>]*d=["']([^"']+)["'][^>]*id=["']${pathId.toLowerCase()}["']`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = svgContent.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Converts a path string to a full HTML path element for clipping.
 * The path needs a fill for clipPath to work properly.
 * No stroke should be visible (stroke is removed to prevent double rendering).
 */
function pathToElement(pathData: string, id: string, fill: string = "#000"): string {
  // Explicitly set stroke to none to prevent any stroke from showing
  return `<path id="${id}" d="${pathData}" fill="${fill}" stroke="none"/>`;
}

/**
 * Converts a path string to a full HTML path element for outline display.
 * Outline elements should have no fill and a stroke.
 * Explicitly set fill="none" to prevent any fill from showing.
 */
function pathToOutlineElement(pathData: string, id: string): string {
  // Explicitly set fill="none" to prevent any fill from showing
  return `<path id="${id}" d="${pathData}" fill="none" stroke="#222" stroke-width="1.25"/>`;
}

/**
 * Extracts the viewBox from SVG content.
 * Returns { x, y, width, height } or null if not found.
 */
function extractViewBox(svgContent: string): { x: number; y: number; width: number; height: number } | null {
  // Try DOM parsing first
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (svg) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every(n => !isNaN(n))) {
            return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
          }
        }
      }
    } catch (e) {
      console.warn('[templates] DOM parsing failed for viewBox, falling back to regex:', e);
    }
  }
  
  // Fallback to regex
  const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  
  return null;
}

/**
 * Calculates the bounding box of an SVG path and scales it from viewBox coordinates to pixel coordinates.
 * This gives us the actual editable area defined by the inner path in pixel space.
 */
function calculatePathBounds(
  pathData: string,
  viewBox: { x: number; y: number; width: number; height: number } | null,
  targetWidthPx: number,
  targetHeightPx: number
): { x: number; y: number; width: number; height: number } {
  let rawBounds: { x: number; y: number; width: number; height: number };
  
  // Use SVG API if available (browser environment)
  if (typeof window !== 'undefined' && 'SVGPathElement' in window) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      // Set the viewBox on the SVG so getBBox returns coordinates in viewBox space
      if (viewBox) {
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      svg.appendChild(path);
      document.body.appendChild(svg);
      
      const bbox = path.getBBox();
      document.body.removeChild(svg);
      
      rawBounds = {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height
      };
    } catch (e) {
      console.warn('[templates] Failed to calculate path bounds using SVG API:', e);
      rawBounds = parsePathBounds(pathData);
    }
  } else {
    // Fallback: parse path data
    rawBounds = parsePathBounds(pathData);
  }
  
  // Scale from viewBox coordinates to pixel coordinates
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    const scaleX = targetWidthPx / viewBox.width;
    const scaleY = targetHeightPx / viewBox.height;
    
    return {
      x: rawBounds.x * scaleX,
      y: rawBounds.y * scaleY,
      width: rawBounds.width * scaleX,
      height: rawBounds.height * scaleY
    };
  }
  
  // If no viewBox, assume path is already in pixel coordinates
  return rawBounds;
}

/**
 * Parses path data to find min/max coordinates (fallback method).
 */
function parsePathBounds(pathData: string): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  // Parse path commands more accurately
  // Match coordinates after path commands (M, L, C, Q, etc.)
  const coordPattern = /[MLCQZ][\s,]*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)[\s,]*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
  let match;
  
  while ((match = coordPattern.exec(pathData)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    if (!isNaN(x) && !isNaN(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  
  // Also try to match all number pairs (less accurate but catches more)
  if (minX === Infinity) {
    const numbers = pathData.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (numbers) {
      for (let i = 0; i < numbers.length; i += 2) {
        if (i + 1 < numbers.length) {
          const x = parseFloat(numbers[i]);
          const y = parseFloat(numbers[i + 1]);
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }
  }
  
  if (minX !== Infinity) {
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  // Ultimate fallback
  return { x: 0, y: 0, width: 288, height: 96 };
}

/**
 * Loads a template directly from SVG file - NO CACHING.
 * This ensures changes to SVG files are immediately visible.
 */
async function loadOne(c: TemplateConfig): Promise<LoadedTemplate> {
  console.log(`[templates] Loading template "${c.id}" from SVG file: ${c.svgFile}`);

  // Fetch the SVG file directly with aggressive cache-busting to force fresh loads
  // Use both timestamp and random number to ensure unique URL every time
  const cacheBuster = `?v=${Date.now()}&r=${Math.random().toString(36).substring(7)}`;
  const response = await fetch(`${c.svgFile}${cacheBuster}`, { 
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  if (!response.ok) {
    throw new Error(`[templates] Failed to fetch SVG file "${c.svgFile}": ${response.status} ${response.statusText}`);
  }
  
  const svgContent = await response.text();
  console.log(`[templates] ✓ Fetched SVG file for "${c.id}" (${svgContent.length} bytes)`);

  // Extract viewBox from SVG to understand the coordinate system
  const viewBox = extractViewBox(svgContent);
  console.log(`[templates] Extracted viewBox for "${c.id}":`, viewBox);

  // Extract paths from SVG
  const innerPath = extractPathFromSvg(svgContent, "Inner");
  const outlinePath = extractPathFromSvg(svgContent, "Outline");
  
  if (!innerPath) {
    throw new Error(`[templates] Template "${c.id}" missing Inner path in SVG file`);
  }

  console.log(`[templates] ✓ Extracted paths for "${c.id}" - Inner: ${innerPath.substring(0, 50)}..., Outline: ${outlinePath ? outlinePath.substring(0, 50) + '...' : 'none'}`);

  // Actual badge dimensions in pixels
  const widthPx = Math.round(c.widthInches * DPI);
  const heightPx = Math.round(c.heightInches * DPI);

  // Calculate designBox from inner path's actual bounds
  // Scale from viewBox coordinates to pixel coordinates
  // This is the "single source of truth" - the inner path defines the editable area
  const innerPathBounds = calculatePathBounds(innerPath, viewBox, widthPx, heightPx);
  
  // designBox represents the editable area (where text and background color go)
  // It's calculated from the inner path's actual bounding box
  const designBox = {
    x: innerPathBounds.x,
    y: innerPathBounds.y,
    width: innerPathBounds.width,
    height: innerPathBounds.height
  };
  
  console.log(`[templates] Inner path bounds for "${c.id}":`, innerPathBounds);
  console.log(`[templates] designBox for "${c.id}":`, designBox);

  // Scale paths from viewBox coordinates to pixel coordinates
  // This ensures paths match the pixel-based viewBox we use in rendering
  let innerElement: string;
  let outlineElement: string | undefined;
  
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    const scaleX = widthPx / viewBox.width;
    const scaleY = heightPx / viewBox.height;
    const transform = `scale(${scaleX}, ${scaleY})`;
    
    innerElement = `<g transform="${transform}">${pathToElement(innerPath, "Inner", "#000")}</g>`;
    outlineElement = outlinePath 
      ? `<g transform="${transform}">${pathToOutlineElement(outlinePath, "Outline")}</g>`
      : undefined;
  } else {
    // No viewBox - assume paths are already in pixel coordinates
    innerElement = pathToElement(innerPath, "Inner", "#000");
    outlineElement = outlinePath 
      ? pathToOutlineElement(outlinePath, "Outline")
      : undefined;
  }
  
  // ViewBox dimensions match actual badge size (no standardization needed)
  const STANDARD_VIEWBOX_WIDTH = widthPx;  // 288px for 3" width
  const STANDARD_VIEWBOX_HEIGHT = heightPx; // 96px for 1×3, 144px for 1.5×3
  
  console.log(`[templates] designBox for "${c.id}":`, {
    designBox,
    widthPx,
    heightPx,
    standardViewBoxWidth: STANDARD_VIEWBOX_WIDTH,
    standardViewBoxHeight: STANDARD_VIEWBOX_HEIGHT
  });

  const t: LoadedTemplate = {
    id: c.id,
    name: c.name,
    widthPx,
    heightPx,
    safeInsetPx: c.safeInsetPx ?? Math.round(0.15 * DPI),
    innerElement,
    outlineElement,
    designBox,
    standardViewBoxWidth: STANDARD_VIEWBOX_WIDTH,
    standardViewBoxHeight: STANDARD_VIEWBOX_HEIGHT
  };
  
  console.log(`[templates] ✓ Loaded template "${c.id}": ${widthPx}×${heightPx}px, designBox:`, designBox);
  
  // NO CACHE - return fresh template every time
  return t;
}

/**
 * Loads a template by ID directly from SVG file.
 * NO CACHING - loads fresh every time.
 */
export async function loadTemplateById(id: string): Promise<LoadedTemplate> {
  const found = cfg.find(t => t.id === id) || cfg[0];
  if (!found) {
    throw new Error(`Template not found: ${id}`);
  }
  return await loadOne(found);
}

/**
 * Loads all templates directly from SVG files.
 * NO CACHING - loads fresh every time.
 * Individual template failures are caught and logged, but don't stop other templates from loading.
 */
export async function loadTemplates(): Promise<LoadedTemplate[]> {
  const loaded: LoadedTemplate[] = [];
  for (const config of cfg) {
    try {
      const template = await loadOne(config);
      loaded.push(template);
    } catch (error) {
      console.error(`[templates] Failed to load template "${config.id}":`, error);
      // Continue loading other templates instead of failing completely
    }
  }
  if (loaded.length === 0) {
    throw new Error('[templates] No templates could be loaded');
  }
  return loaded;
}

/**
 * Clears any cached templates (for development/debugging).
 * Note: This system no longer uses caching, but this function is kept for API compatibility.
 */
export function clearTemplateCache(): void {
  console.log('[templates] Cache clear requested (but no cache exists - templates load fresh from SVG files)');
}

/**
 * Lists all available template options.
 */
export function listTemplateOptions(): { id: string; name: string }[] {
  return cfg.map(t => ({ id: t.id, name: t.name }));
}

/**
 * Template Resolution Utility for Stage 1 Refactor
 * Resolves the appropriate template for a badge.
 */
export async function resolveTemplateForBadge(
  badge: { templateId?: string }, 
  templates: LoadedTemplate[]
): Promise<LoadedTemplate> {
  // Priority: badge.templateId → templates[0] → fallback
  if (badge.templateId) {
    const template = templates.find(t => t.id === badge.templateId);
    if (template) return template;
  }
  
  // Fallback to first available template
  if (templates.length > 0) {
    return templates[0];
  }
  
  // Ultimate fallback - load rect-1x3
  return await loadTemplateById('rect-1x3');
}