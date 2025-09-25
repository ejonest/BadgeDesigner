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

function sanitizeInnerForClip(el: string, id: string): string {
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
  try {
    // Parse the SVG element to get the full template dimensions
    const parser = new DOMParser();
    const doc = parser.parseFromString(innerElement, 'image/svg+xml');
    const svgElement = doc.documentElement;
    
    if (!svgElement) {
      console.warn("[templates] Could not parse element, using fallback");
      return { x: 0, y: 0, width: templateWidth, height: templateHeight };
    }

    // Get the viewBox attribute to determine the full template dimensions
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/);
      if (parts.length === 4) {
        const [, , width, height] = parts.map(Number);
        const designBox = { 
          x: 0, 
          y: 0, 
          width: width, 
          height: height 
        };

        console.log("[templates] Calculated designBox from viewBox:", designBox);
        return designBox;
      }
    }

    // Fallback: use the template dimensions passed in
    const designBox = { 
      x: 0, 
      y: 0, 
      width: templateWidth, 
      height: templateHeight 
    };

    console.log("[templates] Using template dimensions for designBox:", designBox);
    return designBox;
  } catch (error) {
    console.warn("[templates] Failed to calculate designBox, using fallback:", error);
    return { x: 0, y: 0, width: templateWidth, height: templateHeight };
  }
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
    if (el) return el.outerHTML; // full tag markup
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

  const innerElSanitized = sanitizeInnerForClip(innerEl, c.id);
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