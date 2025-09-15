// app/utils/templates.ts
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

function getDesignBox(innerElement: string): { x: number; y: number; width: number; height: number } {
  if (typeof window !== "undefined" && "DOMParser" in window) {
    // Browser: create temp SVG, insert inner element, get bounding box
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tempSvg.setAttribute("viewBox", "0 0 1000 1000"); // Large enough viewBox
    tempSvg.style.position = "absolute";
    tempSvg.style.left = "-9999px";
    tempSvg.style.top = "-9999px";
    tempSvg.style.width = "1000px";
    tempSvg.style.height = "1000px";
    
    document.body.appendChild(tempSvg);
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(innerElement, "image/svg+xml");
      const element = doc.documentElement.firstElementChild;
      
      if (element) {
        tempSvg.appendChild(element);
        const bbox = element.getBBox();
        document.body.removeChild(tempSvg);
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch (error) {
      console.warn("[templates] Failed to getBBox, using fallback:", error);
      document.body.removeChild(tempSvg);
    }
  }
  
  // Fallback: assume centered rectangle (will be refined when SVG files are clean)
  return { x: 0, y: 0, width: 288, height: 96 };
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
  const designBox = getDesignBox(innerElSanitized);

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