// app/utils/templates.ts
import templatesJson from "../data/templates.local.json";
import svgPathBounds from 'svg-path-bounds';

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
  innerElement: string;    // REQUIRED (clip)
  outlineElement?: string; // OPTIONAL (visible preview stroke)
  designBox: { x: number; y: number; width: number; height: number };
};

type TemplatesFile = { version: number; templates: TemplateConfig[] };

const cfg = (templatesJson as TemplatesFile).templates || [];
const cache = new Map<string, LoadedTemplate>();

function resolveCssFill(svg: string, element: string): string {
  // Extract class names from the element (handles nested elements)
  const classMatch = element.match(/class\s*=\s*["']([^"']+)["']/i);
  if (!classMatch) {
    console.log(`[resolveCssFill] No class found in element for ${element.substring(0, 50)}...`);
    return element;
  }
  
  const classNames = classMatch[1].split(/\s+/);
  console.log(`[resolveCssFill] Found classes: ${classNames.join(', ')}`);
  
  // Parse the SVG's style section to find fill values (handles CDATA)
  const styleMatch = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) {
    console.log(`[resolveCssFill] No style section found in SVG`);
    return element;
  }
  
  // Remove CDATA markers if present
  let styleContent = styleMatch[1];
  styleContent = styleContent.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
  
  let resolvedFill: string | null = null;
  
  // Check each class for a fill definition
  for (const className of classNames) {
    // Escape special regex characters in className
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Look for .className { ... fill: value; ... } (more flexible regex)
    const classStyleRegex = new RegExp(`\\.${escapedClassName}\\s*\\{[^}]*?fill\\s*:\\s*([^;\\}]+)`, 'i');
    const classStyleMatch = classStyleRegex.exec(styleContent);
    if (classStyleMatch) {
      const fillValue = classStyleMatch[1].trim();
      // Remove quotes if present
      resolvedFill = fillValue.replace(/^["']|["']$/g, '');
      console.log(`[resolveCssFill] Resolved fill for class ${className}: ${resolvedFill}`);
      break; // Use first matching fill
    }
  }
  
  // If we found a fill value, add it as an inline attribute to the element with the class
  if (resolvedFill !== null) {
    // Find the element tag that has the class attribute and add fill to it
    // This handles both simple elements and nested <g><path class="..."/></g> structures
    if (element.match(/<[^>]*class\s*=\s*["'][^"']+["'][^>]*\s+fill\s*=\s*["'][^"']*["']/i)) {
      // Replace existing fill on the element that has the class
      const result = element.replace(/(<[^>]*class\s*=\s*["'][^"']+["'][^>]*)\s+fill\s*=\s*["'][^"']*["']/i, `$1 fill="${resolvedFill}"`);
      console.log(`[resolveCssFill] Replaced existing fill`);
      return result;
    } else {
      // Add fill attribute to the element that has the class
      const result = element.replace(/(<[^>]*class\s*=\s*["'][^"']+["'])([^>]*>)/i, `$1 fill="${resolvedFill}"$2`);
      console.log(`[resolveCssFill] Added fill="${resolvedFill}" to element`);
      return result;
    }
  } else {
    console.log(`[resolveCssFill] No fill value found for classes: ${classNames.join(', ')}`);
  }
  
  return element;
}

function sanitizeInnerForClip(el: string, id: string, svg?: string): string {
  // If SVG is provided, resolve CSS classes first
  if (svg) {
    el = resolveCssFill(svg, el);
  }
  
  // strip stroke attrs that can cause odd clip behavior
  el = el.replace(/\s+stroke(?:-width)?="[^"]*"/gi, "");
  // ensure a non-none fill exists
  if (/fill\s*=\s*["']none["']/i.test(el)) {
    el = el.replace(/fill\s*=\s*["']none["']/i, 'fill="#000"');
  } else if (!/fill\s*=/.test(el)) {
    el = el.replace(/^(<\w+)/, '$1 fill="#000"');
  }
  // warn if <path> seems open (no 'Z')
  if (/^<path\b/i.test(el) && !/Z["'\s/>]/i.test(el)) {
    console.warn(`[templates] inner path for ${id} may be open (no 'Z').`);
  }
  return el;
}

function getDesignBox(innerElement: string, templateWidth: number, templateHeight: number): { x: number; y: number; width: number; height: number } {
  // The innerElement is just a path/group element, not a full SVG
  // The designBox should match the template dimensions directly
  // This represents the full designable area within the template
  const designBox = { 
    x: 0, 
    y: 0, 
    width: templateWidth, 
    height: templateHeight 
  };

  console.log("[templates] Using template dimensions for designBox:", designBox);
  return designBox;
}

async function fetchSvg(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`[templates] Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function extractElement(svg: string, id: "inner" | "outline"): string | undefined {
  // Prefer DOMParser in browser
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    // Try both lowercase and uppercase versions
    const el =
      (doc.getElementById(id) as SVGGraphicsElement | null) ||
      (doc.getElementById(id.charAt(0).toUpperCase() + id.slice(1)) as SVGGraphicsElement | null) ||
      null;
    if (el) {
      // Check for parent transform groups and collect transforms
      let parent = el.parentElement;
      const transforms: string[] = [];
      
      while (parent && parent.tagName !== 'svg') {
        const parentTransform = parent.getAttribute('transform');
        if (parentTransform) {
          transforms.unshift(parentTransform); // Add to front to maintain order
        }
        parent = parent.parentElement;
      }
      
      // If there are transforms, wrap the element in a group with combined transform
      if (transforms.length > 0) {
        const combinedTransform = transforms.join(' ');
        return `<g transform="${combinedTransform}">${el.outerHTML}</g>`;
      }
      
      return el.outerHTML; // full tag markup
    }
    return undefined;
  }
  // SSR fallback: regex for whole element tag with id (case insensitive)
  const rx = new RegExp(`<(?:path|ellipse)[^>]*\\bid=["']${id}["'][\\s\\S]*?>`, "i");
  const m = svg.match(rx);
  if (m) return m[0];
  
  // Try uppercase version
  const upperId = id.charAt(0).toUpperCase() + id.slice(1);
  const rxUpper = new RegExp(`<(?:path|ellipse)[^>]*\\bid=["']${upperId}["'][\\s\\S]*?>`, "i");
  const mUpper = svg.match(rxUpper);
  return mUpper?.[0];
}

async function loadOne(c: TemplateConfig): Promise<LoadedTemplate> {
  if (cache.has(c.id)) return cache.get(c.id)!;

  const svg = await fetchSvg(c.svgFile);
  
  // Parse <svg viewBox> to get actual dimensions
  let widthPxFromViewBox: number | undefined;
  let heightPxFromViewBox: number | undefined;

  if (typeof window !== "undefined" && "DOMParser" in window) {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgEl = doc.documentElement; // <svg>
    const vb = svgEl.getAttribute("viewBox"); // e.g. "0 0 350 100"
    if (vb) {
      const parts = vb.trim().split(/\s+/);
      if (parts.length === 4) {
        widthPxFromViewBox = Number(parts[2]);
        heightPxFromViewBox = Number(parts[3]);
      }
    }
  } else {
    // SSR fallback: regex for viewBox
    const m = svg.match(/viewBox\s*=\s*["']\s*([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s*["']/i);
    if (m) {
      widthPxFromViewBox = Number(m[3]);
      heightPxFromViewBox = Number(m[4]);
    }
  }

  // Fallback to inches*96 if no viewBox (rare)
  const widthPx = widthPxFromViewBox ?? Math.round(c.widthInches * 96);
  const heightPx = heightPxFromViewBox ?? Math.round(c.heightInches * 96);

  const innerEl = extractElement(svg, "inner");
  if (!innerEl)
    throw new Error(`[templates] ${c.svgFile} missing element with id="inner" (closed path/ellipse)`);

  const outlineEl = extractElement(svg, "outline");

  // Pass svg to sanitizeInnerForClip so it can resolve CSS classes
  const innerElSanitized = sanitizeInnerForClip(innerEl, c.id, svg);
  const designBox = getDesignBox(innerElSanitized, widthPx, heightPx);

  const t: LoadedTemplate = {
    id: c.id,
    name: c.name,
    widthPx,
    heightPx,
    safeInsetPx: Math.max(0, c.safeInsetPx ?? 0),
    innerElement: innerElSanitized,
    outlineElement: outlineEl,
    designBox
  };
  cache.set(c.id, t);
  return t;
}

export async function loadTemplateById(id: string): Promise<LoadedTemplate> {
  const found = cfg.find(t => t.id === id) || cfg[0];
  if (!found) {
    throw new Error(`Template not found: ${id}`);
  }
  return await loadOne(found);
}

export async function loadTemplates(): Promise<LoadedTemplate[]> {
  return await Promise.all(cfg.map(loadOne));
}

export function listTemplateOptions(): { id: string; name: string }[] {
  return cfg.map(t => ({ id: t.id, name: t.name }));
}

// Template Resolution Utility for Stage 1 Refactor
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