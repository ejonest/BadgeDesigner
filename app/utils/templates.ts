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
 * Gets design box from template dimensions.
 */
function getDesignBox(templateWidth: number, templateHeight: number): { x: number; y: number; width: number; height: number } {
  return { 
    x: 0, 
    y: 0, 
    width: templateWidth, 
    height: templateHeight 
  };
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

  // Extract original SVG viewBox to calculate scaling
  // SVG files may have viewBoxes like "0 0 3150 1150" that need to be scaled to our standardized viewBox
  let originalViewBoxWidth = 288;  // Default fallback (assumes already in pixels)
  let originalViewBoxHeight = 144; // Default fallback
  
  const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/i);
  if (viewBoxMatch) {
    originalViewBoxWidth = parseFloat(viewBoxMatch[1]);
    originalViewBoxHeight = parseFloat(viewBoxMatch[2]);
    console.log(`[templates] Extracted viewBox: ${originalViewBoxWidth} × ${originalViewBoxHeight}`);
  } else {
    console.warn(`[templates] Could not extract viewBox from SVG for "${c.id}", using defaults`);
  }

  // Extract paths from SVG
  const innerPath = extractPathFromSvg(svgContent, "Inner");
  const outlinePath = extractPathFromSvg(svgContent, "Outline");
  
  if (!innerPath) {
    throw new Error(`[templates] Template "${c.id}" missing Inner path in SVG file`);
  }

  console.log(`[templates] ✓ Extracted paths for "${c.id}" - Inner: ${innerPath.substring(0, 50)}..., Outline: ${outlinePath ? outlinePath.substring(0, 50) + '...' : 'none'}`);

  // STANDARDIZED VIEWBOX - Single viewBox for all badges to show relative sizes
  // All badges use 288 × 144 viewBox (fits tallest badge: 1.5×3 = 144px height)
  // This allows visual comparison when switching between 1×3 and 1.5×3 badges
  const STANDARD_VIEWBOX_WIDTH = 288;  // 3.0" at 96 DPI
  const STANDARD_VIEWBOX_HEIGHT = 144; // 1.5" at 96 DPI (tallest badge)

  // Actual badge dimensions for content positioning
  const widthPx = Math.round(c.widthInches * DPI);
  const heightPx = Math.round(c.heightInches * DPI);

  // Calculate scale factors to transform paths from original SVG viewBox to standardized viewBox
  // Scale paths to match the badge's actual pixel dimensions within the standardized viewBox
  const scaleX = widthPx / originalViewBoxWidth;
  const scaleY = heightPx / originalViewBoxHeight;

  // Calculate vertical offset to center 1×3 badges in standardized viewBox
  // 1×3 badges (96px height) need to be centered in 144px viewBox = 24px offset
  // 1.5×3 badges (144px height) fill the full viewBox = 0px offset
  const verticalOffset = (STANDARD_VIEWBOX_HEIGHT - heightPx) / 2;

  // Build transform: first scale from original viewBox to badge dimensions, then position in standardized viewBox
  // SVG transforms are applied right-to-left, so we write: translate then scale (but scale is applied first)
  // We want: scale first (in original coordinates), then translate (in scaled coordinates)
  // So we write: translate(0, verticalOffset) scale(scaleX, scaleY)
  // This scales the path, then translates it to the correct position
  const transform = `translate(0, ${verticalOffset}) scale(${scaleX}, ${scaleY})`;
  
  const innerElement = `<g transform="${transform}">${pathToElement(innerPath, "Inner")}</g>`;
  
  const outlineElement = outlinePath 
    ? `<g transform="${transform}">${pathToOutlineElement(outlinePath, "Outline")}</g>`
    : undefined;

  // designBox uses actual badge dimensions for content positioning
  // Content (text, background) is positioned within the actual badge area
  // Also needs vertical offset to match path positioning
  const designBox = {
    x: 0,
    y: verticalOffset,
    width: widthPx,
    height: heightPx
  };

  const t: LoadedTemplate = {
    id: c.id,
    name: c.name,
    widthPx,
    heightPx,
    safeInsetPx: c.safeInsetPx ?? 0,
    innerElement,
    outlineElement,
    designBox,
    standardViewBoxWidth: STANDARD_VIEWBOX_WIDTH,
    standardViewBoxHeight: STANDARD_VIEWBOX_HEIGHT
  };
  
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