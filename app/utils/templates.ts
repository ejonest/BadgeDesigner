// app/utils/templates.ts
/**
 * Template Loading System - Loads directly from SVG files
 *
 * NO CACHING - Templates are loaded fresh from SVG files on every request
 * to ensure changes to SVG files are immediately visible.
 */

import {
  type DesignerVariant,
  isSignLikeVariant,
} from "~/constants/designerVariants";
import type { DesignerSizeKey } from "~/data/designerMotifs";
import { templateIdToDesignerSizeKey } from "~/data/designerMotifs";
import templatesJson from "../data/templates.local.json";
import signTemplatesJson from "../data/sign-templates.local.json";
import plaqueTemplatesJson from "../data/plaque-templates.local.json";
import type {
  ResolvedSignTextLayout,
  SignTextLayoutConfigJson,
} from "~/utils/signTextLayout";
import {
  resolveSignTextLayout,
  type SignPlateCircle,
} from "~/utils/signTextLayout";
import {
  getBlankPhotoPlateConfig,
  type BlankPhotoPlateConfig,
} from "~/utils/badgeBlankPhotos";

const DPI = 96;
const toPx = (inches: number) => Math.round(inches * DPI);

export type TemplateConfig = {
  id: string;
  name: string;
  widthInches: number;
  heightInches: number;
  svgFile: string;
  safeInsetPx?: number;
  /** Sign only: optional text region / per-line width weights (see signTextLayout.ts). */
  textLayout?: SignTextLayoutConfigJson;
  /** Plaque detached: photo slot on wood, normalized to full plaque width/height. */
  plaquePhotoRectNorm?: {
    xNorm: number;
    yNorm: number;
    widthNorm: number;
    heightNorm: number;
  };
};

export type LoadedTemplate = {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  safeInsetPx: number;
  // Store full element markup so we can support <path> or <ellipse>
  innerElement: string; // REQUIRED (clip) - full HTML element like <path id="Inner" d="..." fill="#000"/>
  outlineElement?: string; // OPTIONAL (visible preview stroke) - full HTML element
  /** Sign Designer templates only: decorative overlay paths (trim/swirls). Rendered with border color at runtime. */
  overlayElement?: string;
  /** Set for `designer-*` base templates so render can merge motif paths from `designerMotifs`. */
  designerSizeKey?: DesignerSizeKey;
  designBox: { x: number; y: number; width: number; height: number };
  /** Bounds from inner plate path only — use when sign trim overlay is off (full text area). */
  designBoxInnerPlate: { x: number; y: number; width: number; height: number };
  // Standardized viewBox dimensions (preserves aspect ratio for circles/signs)
  standardViewBoxWidth: number;
  standardViewBoxHeight: number;
  /** Original SVG path for preview thumbnails (e.g. /templates/sign/Circle 10x10.svg). Use encodeURI when using as img src. */
  svgFile?: string;
  /** Sign only: resolved text region, clip rect, and per-line width fractions. */
  signTextLayout?: ResolvedSignTextLayout;
  /** Plaque detached: pixel rect for the photo on wood (template space). */
  plaquePhotoRectPx?: { x: number; y: number; width: number; height: number };
  /** Badge blank product photo layout (text + icon rects on 1500×1500 canvas). */
  blankPhotoPlate?: BlankPhotoPlateConfig;
};

type TemplatesFile = { version: number; templates: TemplateConfig[] };

const badgeCfg = (templatesJson as TemplatesFile).templates || [];
const signCfg = (signTemplatesJson as TemplatesFile).templates || [];
const plaqueCfg = (plaqueTemplatesJson as TemplatesFile).templates || [];

/** Returns template configs for the picker and loading. */
export function getTemplateConfigsForVariant(
  variant: DesignerVariant,
): TemplateConfig[] {
  if (variant === "plaque") return [...plaqueCfg];
  return variant === "sign" ? [...signCfg] : [...badgeCfg];
}

function getCfgForVariant(variant: DesignerVariant): TemplateConfig[] {
  if (variant === "plaque") return plaqueCfg;
  return variant === "sign" ? signCfg : badgeCfg;
}

/**
 * Decode SVG buffer; many sign SVGs are UTF-16 (e.g. from CorelDRAW). response.text() uses UTF-8 and corrupts them.
 */
function decodeSvgBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.slice(2));
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(buffer.slice(3));
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/** Normalize path `d` for stable comparison (DOM vs regex extraction, whitespace). */
function normalizePathD(d: string | null | undefined): string {
  if (!d) return "";
  return d.replace(/\s+/g, " ").trim();
}

function pathDataEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizePathD(a) === normalizePathD(b);
}

/** Union of two layout rectangles (user space). */
function mergeLayoutBounds(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): { x: number; y: number; width: number; height: number } | null {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// NO CACHE - Load fresh from SVG files every time

/**
 * Converts polygon points to SVG path data.
 */
function polygonToPathData(points: string): string {
  // Parse points string (format: "x1,y1 x2,y2 x3,y3" or "x1 y1 x2 y2 x3 y3")
  const coords = points
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n));
  if (coords.length < 4) return "";

  // Start with MoveTo command
  let pathData = `M${coords[0]},${coords[1]}`;

  // Add LineTo commands for remaining points
  for (let i = 2; i < coords.length; i += 2) {
    if (i + 1 < coords.length) {
      pathData += ` L${coords[i]},${coords[i + 1]}`;
    }
  }

  // Close the path
  pathData += " Z";

  return pathData;
}

/**
 * Extracts the first polygon's points and returns path data (for SVGs that use polygon only, e.g. Basic sign templates).
 */
function extractFirstPolygonFromSvg(svgContent: string): string | null {
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const polygon = doc.querySelector("polygon");
      if (polygon) {
        const points = polygon.getAttribute("points");
        if (points) return polygonToPathData(points);
      }
    } catch (e) {
      console.warn("[templates] extractFirstPolygon failed:", e);
    }
  }
  const match = svgContent.match(
    /<polygon[^>]*\bpoints\s*=\s*["']([^"']+)["']/i,
  );
  if (match && match[1]) return polygonToPathData(match[1]);
  return null;
}

/**
 * Extracts a path element from SVG content by ID.
 * Handles different attribute orders and case variations.
 * Also supports polygon elements (converts to path data).
 */
function extractPathFromSvg(svgContent: string, pathId: string): string | null {
  // Create a DOM parser to reliably extract path data
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");

      // Try path element first
      let element =
        doc.querySelector(`path[id="${pathId}"]`) ||
        doc.querySelector(`path[id="${pathId.toLowerCase()}"]`) ||
        doc.querySelector(`path[id="${pathId.toUpperCase()}"]`);

      if (element) {
        const d = element.getAttribute("d");
        if (d) {
          return d;
        }
      }

      // Try polygon element
      element =
        doc.querySelector(`polygon[id="${pathId}"]`) ||
        doc.querySelector(`polygon[id="${pathId.toLowerCase()}"]`) ||
        doc.querySelector(`polygon[id="${pathId.toUpperCase()}"]`);

      if (element) {
        const points = element.getAttribute("points");
        if (points) {
          return polygonToPathData(points);
        }
      }
    } catch (e) {
      console.warn(`[templates] DOM parsing failed, falling back to regex:`, e);
    }
  }

  // Fallback to regex for SSR or if DOM parsing fails
  // Match path with id attribute (handles different attribute orders)
  const pathPatterns = [
    // id="Inner" d="..."
    new RegExp(`<path[^>]*id=["']${pathId}["'][^>]*d=["']([^"']+)["']`, "i"),
    // id="inner" d="..."
    new RegExp(
      `<path[^>]*id=["']${pathId.toLowerCase()}["'][^>]*d=["']([^"']+)["']`,
      "i",
    ),
    // d="..." id="Inner"
    new RegExp(`<path[^>]*d=["']([^"']+)["'][^>]*id=["']${pathId}["']`, "i"),
    // d="..." id="inner"
    new RegExp(
      `<path[^>]*d=["']([^"']+)["'][^>]*id=["']${pathId.toLowerCase()}["']`,
      "i",
    ),
  ];

  for (const pattern of pathPatterns) {
    const match = svgContent.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Try polygon patterns
  const polygonPatterns = [
    // id="Inner" points="..."
    new RegExp(
      `<polygon[^>]*id=["']${pathId}["'][^>]*points=["']([^"']+)["']`,
      "i",
    ),
    // id="inner" points="..."
    new RegExp(
      `<polygon[^>]*id=["']${pathId.toLowerCase()}["'][^>]*points=["']([^"']+)["']`,
      "i",
    ),
    // points="..." id="Inner"
    new RegExp(
      `<polygon[^>]*points=["']([^"']+)["'][^>]*id=["']${pathId}["']`,
      "i",
    ),
    // points="..." id="inner"
    new RegExp(
      `<polygon[^>]*points=["']([^"']+)["'][^>]*id=["']${pathId.toLowerCase()}["']`,
      "i",
    ),
  ];

  for (const pattern of polygonPatterns) {
    const match = svgContent.match(pattern);
    if (match && match[1]) {
      return polygonToPathData(match[1]);
    }
  }

  return null;
}

/**
 * Converts circle (cx, cy, r) to SVG path d string.
 */
function circleToPathD(cx: number, cy: number, r: number): string {
  return `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${
    cx + r
  },${cy} A ${r},${r} 0 0 1 ${cx - r},${cy}`;
}

/**
 * Converts ellipse (cx, cy, rx, ry) to SVG path d string.
 */
function ellipseToPathD(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  return `M ${cx - rx},${cy} A ${rx},${ry} 0 0 1 ${
    cx + rx
  },${cy} A ${rx},${ry} 0 0 1 ${cx - rx},${cy}`;
}

/**
 * Extracts circle or ellipse from SVG and returns path d (for sign templates that use primitive shapes).
 */
function extractCircleOrEllipseFromSvg(svgContent: string): string | null {
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const circle = doc.querySelector("circle");
      if (circle) {
        const cx = parseFloat(circle.getAttribute("cx") ?? "0");
        const cy = parseFloat(circle.getAttribute("cy") ?? "0");
        const r = parseFloat(circle.getAttribute("r") ?? "0");
        if (!isNaN(cx) && !isNaN(cy) && !isNaN(r) && r > 0) {
          return circleToPathD(cx, cy, r);
        }
      }
      const ellipse = doc.querySelector("ellipse");
      if (ellipse) {
        const cx = parseFloat(ellipse.getAttribute("cx") ?? "0");
        const cy = parseFloat(ellipse.getAttribute("cy") ?? "0");
        const rx = parseFloat(ellipse.getAttribute("rx") ?? "0");
        const ry = parseFloat(ellipse.getAttribute("ry") ?? "0");
        if (
          !isNaN(cx) &&
          !isNaN(cy) &&
          !isNaN(rx) &&
          !isNaN(ry) &&
          rx > 0 &&
          ry > 0
        ) {
          return ellipseToPathD(cx, cy, rx, ry);
        }
      }
    } catch (e) {
      console.warn("[templates] Circle/ellipse extraction failed:", e);
    }
  }
  // Regex fallback for circle (attribute order can vary)
  const circleCxCyR = svgContent.match(
    /<circle[^>]*\bcx\s*=\s*["']([^"']+)["'][^>]*\bcy\s*=\s*["']([^"']+)["'][^>]*\br\s*=\s*["']([^"']+)["']/i,
  );
  if (circleCxCyR) {
    const cx = parseFloat(circleCxCyR[1]);
    const cy = parseFloat(circleCxCyR[2]);
    const r = parseFloat(circleCxCyR[3]);
    if (!isNaN(cx) && !isNaN(cy) && !isNaN(r) && r > 0)
      return circleToPathD(cx, cy, r);
  }
  const circleRCxCy = svgContent.match(
    /<circle[^>]*\br\s*=\s*["']([^"']+)["'][^>]*\bcx\s*=\s*["']([^"']+)["'][^>]*\bcy\s*=\s*["']([^"']+)["']/i,
  );
  if (circleRCxCy) {
    const r = parseFloat(circleRCxCy[1]);
    const cx = parseFloat(circleRCxCy[2]);
    const cy = parseFloat(circleRCxCy[3]);
    if (!isNaN(cx) && !isNaN(cy) && !isNaN(r) && r > 0)
      return circleToPathD(cx, cy, r);
  }
  return null;
}

/**
 * Extracts the "d" of the first path whose class contains the given classToken (e.g. "fil0" for dark fill in Classic Framed SVGs).
 * Use when path order may vary (e.g. encoding) so we always get the background shape.
 */
function extractPathByClassFromSvg(
  svgContent: string,
  classToken: string,
): string | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    const token = classToken.toLowerCase();
    for (let i = 0; i < paths.length; i++) {
      const cls = (paths[i].getAttribute("class") ?? "").toLowerCase();
      if (cls.includes(token)) {
        const d = paths[i].getAttribute("d");
        if (d) return d;
        break;
      }
    }
  } catch (e) {
    console.warn("[templates] extractPathByClass failed:", e);
  }
  return null;
}

/** Corel sign exports: dark plate `fil0`, light trim `fil1` (border color at runtime). */
function isSignFil0Fil1TrimTemplateId(templateId: string): boolean {
  return /^(arrow|door-hanger|headstone-basic|vintage|western-elegant)-/.test(
    templateId,
  );
}

/** First dark plate: path class fil0, else polygon class fil0 (e.g. Arrow). */
function extractFil0PlatePathFromSvg(svgContent: string): string | null {
  const fromPath = extractPathByClassFromSvg(svgContent, "fil0");
  if (fromPath) return fromPath;
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const polys = doc.querySelectorAll("polygon");
      for (let i = 0; i < polys.length; i++) {
        const cls = (polys[i].getAttribute("class") ?? "").toLowerCase();
        if (cls.includes("fil0")) {
          const pts = polys[i].getAttribute("points");
          if (pts) return polygonToPathData(pts);
        }
      }
    } catch (e) {
      console.warn("[templates] extractFil0Plate polygon failed:", e);
    }
  }
  const m1 = svgContent.match(
    /<polygon[^>]*\bclass\s*=\s*["'][^"']*fil0[^"']*["'][^>]*\bpoints\s*=\s*["']([^"']+)["']/i,
  );
  if (m1?.[1]) return polygonToPathData(m1[1]);
  const m2 = svgContent.match(
    /<polygon[^>]*\bpoints\s*=\s*["']([^"']+)["'][^>]*\bfil0\b/i,
  );
  if (m2?.[1]) return polygonToPathData(m2[1]);
  return null;
}

/** All `<path class="…fil1…">` `d` values (door hanger: body ring + knob hole ring). */
function extractAllPathsByClassFromSvg(
  svgContent: string,
  classToken: string,
): string[] {
  const out: string[] = [];
  if (typeof DOMParser === "undefined") return out;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    const token = classToken.toLowerCase();
    for (let i = 0; i < paths.length; i++) {
      const cls = (paths[i].getAttribute("class") ?? "").toLowerCase();
      if (cls.includes(token)) {
        const d = paths[i].getAttribute("d");
        if (d) out.push(d);
      }
    }
  } catch (e) {
    console.warn("[templates] extractAllPathsByClass failed:", e);
  }
  return out;
}

/**
 * For Classic Framed sign SVGs: the full background is a single contour (no "zm");
 * the trim is a compound path with "zm". Returns { backgroundPath, trimPath } so we always
 * get the right layers regardless of path order or class parsing.
 */
function extractClassicFramedPathsByStructure(svgContent: string): {
  backgroundPath: string | null;
  trimPath: string | null;
} {
  if (typeof DOMParser === "undefined") {
    return { backgroundPath: null, trimPath: null };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    let backgroundPath: string | null = null;
    let trimPath: string | null = null;
    for (let i = 0; i < paths.length; i++) {
      const d = paths[i].getAttribute("d");
      if (!d) continue;
      // Compound path (donut/trim) contains relative moveto "zm"; single contour (full rect) does not
      if (d.includes("zm")) {
        trimPath = d;
      } else {
        backgroundPath = d;
      }
    }
    return { backgroundPath, trimPath };
  } catch (e) {
    console.warn("[templates] extractClassicFramedPathsByStructure failed:", e);
    return { backgroundPath: null, trimPath: null };
  }
}

/**
 * First `<path>` in document order whose `d` is a single contour (no `zm` compound) and is not the trim ring.
 * Square / Standard / Oval / Portrait / Victorian / Notched / Pill use this for the outer plate when paired with `id="Border"`.
 */
function extractFirstSimplePlatePath(
  svgContent: string,
  trimPath: string,
): string | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    for (let i = 0; i < paths.length; i++) {
      const d = paths[i].getAttribute("d");
      if (!d || d.includes("zm") || pathDataEqual(d, trimPath)) continue;
      return d;
    }
  } catch (e) {
    console.warn("[templates] extractFirstSimplePlatePath failed:", e);
  }
  return null;
}

/**
 * Sign templates with outer plate + `path#Border` compound ring (`zm`): plate = background fill, Border = border-color overlay.
 */
function extractSignInsetTrimPlateAndBorder(svgContent: string): {
  platePath: string;
  trimPath: string;
} | null {
  const trimPath = extractPathFromSvg(svgContent, "Border");
  if (!trimPath || !trimPath.includes("zm")) return null;

  let platePath = extractFirstPolygonFromSvg(svgContent);
  if (!platePath) {
    platePath = extractFirstSimplePlatePath(svgContent, trimPath);
  }
  if (!platePath || pathDataEqual(platePath, trimPath)) return null;
  return { platePath, trimPath };
}

/**
 * Extracts the n-th path's "d" attribute from SVG (0-based). Used as fallback when no Inner/Design/circle.
 */
function extractNthPathFromSvg(
  svgContent: string,
  index: number,
): string | null {
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const paths = doc.querySelectorAll("path");
      const path = paths[index];
      if (path) {
        const d = path.getAttribute("d");
        if (d) return d;
      }
    } catch (e) {
      console.warn("[templates] extractNthPath failed:", e);
    }
  }
  const pathRegex = /<path[^>]*\bd\s*=\s*["']([^"']+)["']/gi;
  let match;
  let n = 0;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    if (n === index) return match[1];
    n++;
  }
  return null;
}

/**
 * Converts a path string to a full HTML path element for clipping.
 * The path needs a fill for clipPath to work properly.
 * No stroke should be visible (stroke is removed to prevent double rendering).
 */
function pathToElement(
  pathData: string,
  id: string,
  fill: string = "#000",
): string {
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
  return `<path id="${id}" d="${pathData}" fill="none" stroke="#000000" stroke-width="1.25"/>`;
}

/** Border trim path only (sign Designer); scroll/motif paths come from `getDesignerMotifPaths` at render time. */
function extractDesignerBorderOverlayOnly(
  svgContent: string,
  transform: string,
  outerPathD: string,
): string {
  if (typeof DOMParser === "undefined") return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const id = (path.getAttribute("id") || "").trim();
      const d = path.getAttribute("d");
      if (id !== "Border" || !d) continue;
      if (pathDataEqual(d, outerPathD)) continue;
      return `<g transform="${transform}"><path d="${d.replace(
        /"/g,
        "&quot;",
      )}"/></g>`;
    }
  } catch (e) {
    console.warn("[templates] extractDesignerBorderOverlayOnly failed:", e);
  }
  return "";
}

/**
 * Extracts the viewBox from SVG content.
 * Returns { x, y, width, height } or null if not found.
 */
function extractViewBox(
  svgContent: string,
): { x: number; y: number; width: number; height: number } | null {
  // Try DOM parsing first
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (svg) {
        const viewBox = svg.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
            return {
              x: parts[0],
              y: parts[1],
              width: parts[2],
              height: parts[3],
            };
          }
        }
      }
    } catch (e) {
      console.warn(
        "[templates] DOM parsing failed for viewBox, falling back to regex:",
        e,
      );
    }
  }

  // Fallback to regex
  const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
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
  targetHeightPx: number,
): { x: number; y: number; width: number; height: number } {
  let rawBounds: { x: number; y: number; width: number; height: number };

  // Use SVG API if available (browser environment)
  if (typeof window !== "undefined" && "SVGPathElement" in window) {
    try {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      // Set the viewBox on the SVG so getBBox returns coordinates in viewBox space
      if (viewBox) {
        svg.setAttribute(
          "viewBox",
          `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
        );
      }
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", pathData);
      svg.appendChild(path);
      document.body.appendChild(svg);

      const bbox = path.getBBox();
      document.body.removeChild(svg);

      rawBounds = {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      };
    } catch (e) {
      console.warn(
        "[templates] Failed to calculate path bounds using SVG API:",
        e,
      );
      rawBounds = parsePathBounds(pathData);
    }
  } else {
    // Fallback: parse path data
    rawBounds = parsePathBounds(pathData);
  }

  // Scale from layout viewBox to pixels (subtract origin — paths use file user space, not cropped origin).
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    const scaleX = targetWidthPx / viewBox.width;
    const scaleY = targetHeightPx / viewBox.height;

    return {
      x: (rawBounds.x - viewBox.x) * scaleX,
      y: (rawBounds.y - viewBox.y) * scaleY,
      width: rawBounds.width * scaleX,
      height: rawBounds.height * scaleY,
    };
  }

  // If no viewBox, assume path is already in pixel coordinates
  return rawBounds;
}

/**
 * Parses path data to find min/max coordinates (fallback method).
 */
function parsePathBounds(pathData: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  // Parse path commands more accurately
  // Match coordinates after path commands (M, L, C, Q, etc.)
  const coordPattern =
    /[MLCQZ][\s,]*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)[\s,]*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
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
      height: maxY - minY,
    };
  }

  // Ultimate fallback
  return { x: 0, y: 0, width: 288, height: 96 };
}

function unionBoundsFromPathData(
  paths: string[],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const d of paths) {
    const b = parsePathBounds(d);
    if (!isFinite(b.x) || b.width < 2 || b.height < 2) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function unionBoundsFromAllSvgPaths(
  svgContent: string,
): { x: number; y: number; width: number; height: number } | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const paths = doc.querySelectorAll("path");
    const ds: string[] = [];
    for (let i = 0; i < paths.length; i++) {
      const d = paths[i].getAttribute("d");
      if (d) ds.push(d);
    }
    return unionBoundsFromPathData(ds);
  } catch {
    return null;
  }
}

/**
 * Widen or heighten a crop box (centered) so its aspect ratio matches the physical sign
 * (widthInches / heightInches). Otherwise scale(scaleX, scaleY) squashes artwork when the
 * union-of-paths bbox is taller or wider than the real sign.
 */
function expandViewBoxToOutputAspect(
  box: { x: number; y: number; width: number; height: number },
  widthInches: number,
  heightInches: number,
): { x: number; y: number; width: number; height: number } {
  if (!(box.height > 0) || !(heightInches > 0)) return box;
  const targetAspect = widthInches / heightInches;
  const currentAspect = box.width / box.height;
  if (Math.abs(currentAspect - targetAspect) < 0.012) return box;

  let { x, y, width, height } = box;
  if (currentAspect > targetAspect) {
    const newH = width / targetAspect;
    const dh = newH - height;
    y -= dh / 2;
    height = newH;
  } else {
    const newW = height * targetAspect;
    const dw = newW - width;
    x -= dw / 2;
    width = newW;
  }
  return { x, y, width, height };
}

/**
 * Themed Designer SVGs from Corel often use a letter-size viewBox (e.g. 8500×11000) with the
 * sign artwork centered. Scaling that full box shrinks the sign in previews.
 * Crop to the union of *all* path bounds so scrolls/paws (not just outer+Border) stay in frame.
 */
function tightDesignerViewBoxIfCanvasMismatch(
  templateId: string,
  rawViewBox: { x: number; y: number; width: number; height: number },
  svgContent: string,
  outerPathD: string,
  borderPathD: string,
  widthInches: number,
  heightInches: number,
): { x: number; y: number; width: number; height: number } | null {
  if (
    !/^designer-(coffee-bean|golf|house|money|paws|recycle)-/.test(templateId)
  ) {
    return null;
  }
  // Corel/unwrap sometimes leaves a *cropped* viewBox with non-zero x/y (paths still in absolute
  // user space). Using that rect as layout works in theory (translate -x,-y), but the same
  // themed art at 4×9 uses viewBox 0 0 … and goes through the union crop below. Skipping the crop
  // for 2×5 / 2.8×7 only produced blank previews while large sizes looked fine — so whenever the
  // file viewBox origin is offset, always derive layout from path unions like we do for aspect
  // mismatches and letter canvases.
  const viewBoxHasOffsetOrigin =
    Math.abs(rawViewBox.x) > 0.5 || Math.abs(rawViewBox.y) > 0.5;
  // Exports that already match the physical sign aspect and are not letter-page canvases
  // should use the file viewBox as-is (avoids bad crops when parsePathBounds underestimates paths).
  const fileAspect = rawViewBox.width / rawViewBox.height;
  const outAspect = widthInches / heightInches;
  const maxDim = Math.max(rawViewBox.width, rawViewBox.height);
  const looksLetterCanvas =
    rawViewBox.width >= 7500 && rawViewBox.height >= 9500;
  if (
    !viewBoxHasOffsetOrigin &&
    !looksLetterCanvas &&
    maxDim < 12000 &&
    Math.abs(fileAspect - outAspect) < 0.12
  ) {
    return null;
  }
  const uAll = unionBoundsFromAllSvgPaths(svgContent);
  const uCore = unionBoundsFromPathData([outerPathD, borderPathD]);
  // Always merge: naive path bounds can make uAll smaller than uCore; using only uAll then crops wrong and previews go blank.
  const u = mergeLayoutBounds(uAll, uCore);
  if (!u || u.width <= 0 || u.height <= 0) return null;
  const pad = Math.max(u.width, u.height) * 0.04;
  let tight = {
    x: u.x - pad,
    y: u.y - pad,
    width: u.width + 2 * pad,
    height: u.height + 2 * pad,
  };
  tight = expandViewBoxToOutputAspect(tight, widthInches, heightInches);
  const fullArea = rawViewBox.width * rawViewBox.height;
  const tightArea = tight.width * tight.height;
  if (!viewBoxHasOffsetOrigin && tightArea >= fullArea * 0.52) return null;
  return tight;
}

/**
 * Loads a template directly from SVG file - NO CACHING.
 * This ensures changes to SVG files are immediately visible.
 * @param variant - "sign" vs "badge"; sign Designer templates use Border as inner + overlay.
 */
async function loadOne(
  c: TemplateConfig,
  variant: DesignerVariant = "badge",
): Promise<LoadedTemplate> {
  console.log(
    `[templates] Loading template "${c.id}" from SVG file: ${c.svgFile}`,
  );

  // Fetch the SVG file directly with aggressive cache-busting to force fresh loads
  // Encode path so spaces etc. become %20 (sign templates have spaces in filenames)
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const cacheBuster = `?v=${timestamp}&r=${random}&_=${performance.now()}`;
  const pathEncoded =
    typeof c.svgFile === "string" && c.svgFile.includes(" ")
      ? encodeURI(c.svgFile)
      : c.svgFile;
  const url = `${pathEncoded}${cacheBuster}`;
  console.log(`[templates] Fetching template "${c.id}" from: ${url}`);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Requested-With": "XMLHttpRequest", // Some servers respect this
    },
  });
  if (!response.ok) {
    throw new Error(
      `[templates] Failed to fetch SVG file "${c.svgFile}": ${response.status} ${response.statusText}`,
    );
  }

  // Use arrayBuffer so we can handle UTF-16 SVGs (e.g. from CorelDRAW); response.text() decodes as UTF-8 and corrupts them
  const buf = await response.arrayBuffer();
  const svgContent = decodeSvgBuffer(buf);
  console.log(
    `[templates] ✓ Fetched SVG file for "${c.id}" (${svgContent.length} chars)`,
  );

  // If we got HTML (e.g. SPA fallback or 404 page), fail with a clear message
  const trimmed = svgContent.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    const preview = trimmed.substring(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Server returned HTML instead of SVG (check static serving of ${c.svgFile}). Preview: ${preview}...`,
    );
  }
  const head = (
    svgContent.substring(0, 500).replace(/\s+/g, " ") || ""
  ).toLowerCase();
  if (
    !head.includes("<svg") &&
    !head.includes("<circle") &&
    !head.includes("<?xml")
  ) {
    const preview = trimmed.substring(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Response does not look like SVG for ${c.svgFile}. Preview: ${preview}...`,
    );
  }

  // Log first 200 chars of SVG content to verify we're getting the right file
  console.log(
    `[templates] SVG content preview for "${c.id}":`,
    svgContent.substring(0, 200),
  );

  // Extract viewBox from SVG to understand the coordinate system
  const viewBox = extractViewBox(svgContent);
  console.log(`[templates] Extracted viewBox for "${c.id}":`, viewBox);

  // Extract inner path: prefer path id="Inner", then id="Design" (sign Designer templates), then circle/ellipse, then 3rd/2nd/1st path (framed/fancy signs), then first polygon (Basic sign templates)
  let innerPath =
    extractPathFromSvg(svgContent, "Inner") ||
    extractPathFromSvg(svgContent, "Design") ||
    extractCircleOrEllipseFromSvg(svgContent) ||
    extractNthPathFromSvg(svgContent, 2) ||
    extractNthPathFromSvg(svgContent, 1) ||
    extractNthPathFromSvg(svgContent, 0) ||
    extractFirstPolygonFromSvg(svgContent);
  let outlinePath =
    extractPathFromSvg(svgContent, "Outline") ||
    extractPathFromSvg(svgContent, "Border") ||
    extractFirstPolygonFromSvg(svgContent); // Basic templates: use same polygon as outline

  const borderPath = extractPathFromSvg(svgContent, "Border");
  const outerPath =
    extractNthPathFromSvg(svgContent, 0) ||
    extractFirstPolygonFromSvg(svgContent); // Basic: polygon is the only shape
  const isSignDesignerWithBorder =
    isSignLikeVariant(variant) &&
    c.id.startsWith("designer-") &&
    outlinePath &&
    borderPath &&
    outerPath &&
    pathDataEqual(outlinePath, borderPath);

  // Classic Framed: identify by structure so we always get the right layers (single contour = full background, compound "zm" = trim)
  const classicFramedByStructure =
    extractClassicFramedPathsByStructure(svgContent);
  const classicFramedBackgroundPath =
    classicFramedByStructure.backgroundPath ||
    extractPathByClassFromSvg(svgContent, "fil0") ||
    extractNthPathFromSvg(svgContent, 0);
  const trimPathClassic =
    classicFramedByStructure.trimPath ||
    extractPathByClassFromSvg(svgContent, "fil1") ||
    extractNthPathFromSvg(svgContent, 1);
  const trimPathFancy = extractNthPathFromSvg(svgContent, 2);
  const isSignClassicFramed =
    isSignLikeVariant(variant) &&
    c.id.startsWith("classic-framed-") &&
    classicFramedBackgroundPath &&
    trimPathClassic;

  const fil0PlateSignTrim = extractFil0PlatePathFromSvg(svgContent);
  const fil1TrimPathsAll = extractAllPathsByClassFromSvg(svgContent, "fil1");
  const isSignFil0Fil1TrimLayout =
    isSignLikeVariant(variant) &&
    isSignFil0Fil1TrimTemplateId(c.id) &&
    Boolean(fil0PlateSignTrim) &&
    fil1TrimPathsAll.length > 0;

  // Debug: why does only 7x10 render correctly? Log extraction source and path fingerprints.
  if (isSignLikeVariant(variant) && c.id.startsWith("classic-framed-")) {
    const srcBg = classicFramedByStructure.backgroundPath
      ? "structure"
      : extractPathByClassFromSvg(svgContent, "fil0")
      ? "fil0"
      : "nth(0)";
    const srcTrim = classicFramedByStructure.trimPath
      ? "structure"
      : extractPathByClassFromSvg(svgContent, "fil1")
      ? "fil1"
      : "nth(1)";
    const bgHasZm = classicFramedBackgroundPath?.includes("zm") ?? false;
    const trimHasZm = trimPathClassic?.includes("zm") ?? false;
    console.log(`[templates] Classic Framed "${c.id}" DEBUG:`, {
      hasDOMParser: typeof DOMParser !== "undefined",
      structureBackground: classicFramedByStructure.backgroundPath
        ? `${classicFramedByStructure.backgroundPath.length} chars`
        : null,
      structureTrim: classicFramedByStructure.trimPath
        ? `${classicFramedByStructure.trimPath.length} chars`
        : null,
      sourceBackground: srcBg,
      sourceTrim: srcTrim,
      backgroundPathHasZm: bgHasZm,
      trimPathHasZm: trimHasZm,
      pathSwap:
        bgHasZm && !trimHasZm
          ? "SWAPPED (bg has zm, trim does not)"
          : !bgHasZm && trimHasZm
          ? "OK"
          : "UNEXPECTED",
      backgroundStart: classicFramedBackgroundPath?.substring(0, 60),
      trimStart: trimPathClassic?.substring(0, 60),
      svgContentLength: svgContent.length,
      svgContentStart: svgContent.substring(0, 120).replace(/\s+/g, " "),
    });
  }
  const isSignFancy =
    isSignLikeVariant(variant) &&
    c.id.startsWith("fancy-") &&
    outerPath &&
    trimPathFancy;

  const signInsetTrim =
    isSignLikeVariant(variant) &&
    !isSignDesignerWithBorder &&
    !isSignClassicFramed &&
    !isSignFancy &&
    !isSignFil0Fil1TrimLayout
      ? extractSignInsetTrimPlateAndBorder(svgContent)
      : null;
  const isSignInsetTrim = !!signInsetTrim;

  /** notched- large SVGs may omit id="Border" on path1; use path order like fancy/inset. */
  const notchedP0 =
    isSignLikeVariant(variant) && c.id.startsWith("notched-")
      ? extractNthPathFromSvg(svgContent, 0)
      : null;
  const notchedP1 =
    isSignLikeVariant(variant) && c.id.startsWith("notched-")
      ? extractNthPathFromSvg(svgContent, 1)
      : null;
  const isSignNotched =
    isSignLikeVariant(variant) &&
    c.id.startsWith("notched-") &&
    Boolean(notchedP0 && notchedP1) &&
    !isSignInsetTrim;

  if (isSignDesignerWithBorder) {
    innerPath = outerPath; // background = outer dark shape; trim + fancy bits = border color (in overlay)
    console.log(
      `[templates] Sign Designer "${c.id}": using outer path for background; Border + Design in overlay`,
    );
  } else if (isSignClassicFramed) {
    innerPath = classicFramedBackgroundPath;
    console.log(
      `[templates] Sign Classic Framed "${c.id}": using fil0 path for background, fil1 path for trim (border color)`,
    );
  } else if (isSignFil0Fil1TrimLayout) {
    innerPath = fil0PlateSignTrim!;
    console.log(
      `[templates] Sign fil0/fil1 "${c.id}": fil0 plate = background fill, fil1 = border trim overlay`,
    );
  } else if (isSignFancy) {
    innerPath = outerPath;
    console.log(
      `[templates] Sign Fancy "${c.id}": using path 0 for background, path 2 for trim (border color)`,
    );
  } else if (isSignInsetTrim) {
    innerPath = signInsetTrim.platePath;
    console.log(
      `[templates] Sign inset trim "${c.id}": plate path for background, id=Border for trim (border color)`,
    );
  } else if (isSignNotched) {
    innerPath = notchedP0!;
    console.log(
      `[templates] Sign notched "${c.id}": path0 = plate, path1 = border trim (overlay)`,
    );
  }

  if (!innerPath) {
    throw new Error(
      `[templates] Template "${c.id}" missing Inner/Design/circle/path in SVG file`,
    );
  }

  console.log(
    `[templates] ✓ Extracted paths for "${c.id}" - Inner: ${innerPath.substring(
      0,
      100,
    )}..., Outline: ${
      outlinePath ? outlinePath.substring(0, 100) + "..." : "none"
    }`,
  );

  // Verify coextensive paths (Inner and Outline should match when coextensive)
  if (outlinePath && innerPath === outlinePath) {
    console.log(
      `[templates] ✓ Template "${c.id}" has coextensive Inner and Outline paths`,
    );
  } else if (outlinePath) {
    console.log(
      `[templates] ⚠ Template "${c.id}" has different Inner and Outline paths`,
    );
    console.log(
      `[templates] Inner path length: ${innerPath.length}, Outline path length: ${outlinePath.length}`,
    );
    console.log(`[templates] Inner starts with: ${innerPath.substring(0, 50)}`);
    console.log(
      `[templates] Outline starts with: ${outlinePath.substring(0, 50)}`,
    );
  }

  // Actual badge dimensions in pixels
  const widthPx = Math.round(c.widthInches * DPI);
  const heightPx = Math.round(c.heightInches * DPI);

  let layoutViewBox = viewBox;
  if (viewBox && isSignDesignerWithBorder && outerPath && borderPath) {
    const tight = tightDesignerViewBoxIfCanvasMismatch(
      c.id,
      viewBox,
      svgContent,
      outerPath,
      borderPath,
      c.widthInches,
      c.heightInches,
    );
    if (tight) layoutViewBox = tight;
  }

  // Calculate designBox: for sign Designer/Classic Framed/Fancy use trim path so text stays inside the trim; else use inner path
  const trimPathFil1ForDesign = isSignFil0Fil1TrimLayout
    ? fil1TrimPathsAll.find((d) => d.includes("zm")) ?? fil1TrimPathsAll[0]
    : null;
  const trimPath = isSignClassicFramed
    ? trimPathClassic!
    : isSignFil0Fil1TrimLayout
    ? trimPathFil1ForDesign!
    : isSignFancy
    ? trimPathFancy!
    : isSignNotched
    ? notchedP1!
    : isSignInsetTrim
    ? signInsetTrim!.trimPath
    : null;
  const pathForDesignBox =
    isSignDesignerWithBorder && borderPath
      ? borderPath
      : trimPath
      ? trimPath
      : innerPath;
  const innerPathBounds = calculatePathBounds(
    pathForDesignBox,
    layoutViewBox,
    widthPx,
    heightPx,
  );

  const innerPlateBoundsRaw = calculatePathBounds(
    innerPath,
    layoutViewBox,
    widthPx,
    heightPx,
  );

  // designBox represents the editable area (where text and background color go)
  // Use the full badge dimensions to ensure badges fill the SVG properly
  // The inner path bounds are used for clipping, but designBox should match badge size for proper scaling
  const inset = c.safeInsetPx ?? Math.round(0.15 * DPI);

  const designBox = {
    x: innerPathBounds.x + inset,
    y: innerPathBounds.y + inset,
    width: innerPathBounds.width - inset * 2,
    height: innerPathBounds.height - inset * 2,
  };

  const designBoxInnerPlate = {
    x: innerPlateBoundsRaw.x + inset,
    y: innerPlateBoundsRaw.y + inset,
    width: innerPlateBoundsRaw.width - inset * 2,
    height: innerPlateBoundsRaw.height - inset * 2,
  };

  console.log(`[templates] Inner path bounds for "${c.id}":`, innerPathBounds);
  console.log(`[templates] designBox for "${c.id}":`, designBox);

  // Scale paths from viewBox coordinates to pixel coordinates
  // This ensures paths match the pixel-based viewBox we use in rendering
  let innerElement: string;
  let outlineElement: string | undefined;

  let overlayElement: string | undefined;
  if (layoutViewBox && layoutViewBox.width > 0 && layoutViewBox.height > 0) {
    const scaleX = widthPx / layoutViewBox.width;
    const scaleY = heightPx / layoutViewBox.height;
    const transform = `translate(${-layoutViewBox.x}, ${-layoutViewBox.y}) scale(${scaleX}, ${scaleY})`;

    innerElement = `<g transform="${transform}">${pathToElement(
      innerPath,
      "Inner",
      "#000",
    )}</g>`;
    if (isSignDesignerWithBorder && outerPath) {
      outlineElement = `<g transform="${transform}">${pathToOutlineElement(
        outerPath,
        "Outline",
      )}</g>`;
      overlayElement = extractDesignerBorderOverlayOnly(
        svgContent,
        transform,
        outerPath,
      );
      if (overlayElement) {
        console.log(
          `[templates] Sign Designer "${c.id}": overlay = Border only; motifs merged at render`,
        );
      }
    } else if (
      isSignClassicFramed ||
      isSignFil0Fil1TrimLayout ||
      isSignFancy ||
      isSignInsetTrim
    ) {
      const outlinePlate = isSignClassicFramed
        ? classicFramedBackgroundPath
        : isSignFil0Fil1TrimLayout
        ? fil0PlateSignTrim
        : isSignFancy
        ? outerPath
        : signInsetTrim!.platePath;
      const trimDs: string[] = isSignClassicFramed
        ? [trimPathClassic!]
        : isSignFil0Fil1TrimLayout
        ? fil1TrimPathsAll
        : isSignFancy
        ? [trimPathFancy!]
        : [signInsetTrim!.trimPath];
      if (outlinePlate && trimDs.length > 0) {
        outlineElement = `<g transform="${transform}">${pathToOutlineElement(
          outlinePlate,
          "Outline",
        )}</g>`;
        overlayElement = `<g transform="${transform}">${trimDs
          .map((d) => `<path d="${d.replace(/"/g, "&quot;")}"/>`)
          .join("")}</g>`;
        console.log(
          `[templates] Sign "${c.id}": overlay = trim path(s) (border color), count=${trimDs.length}`,
        );
      }
    } else if (isSignNotched && notchedP0 && notchedP1) {
      outlineElement = `<g transform="${transform}">${pathToOutlineElement(
        notchedP0,
        "Outline",
      )}</g>`;
      overlayElement = `<g transform="${transform}"><path d="${notchedP1.replace(
        /"/g,
        "&quot;",
      )}"/></g>`;
      console.log(
        `[templates] Sign notched "${c.id}": plate outline + path1 trim overlay (border on/off)`,
      );
    } else {
      outlineElement = outlinePath
        ? `<g transform="${transform}">${pathToOutlineElement(
            outlinePath,
            "Outline",
          )}</g>`
        : undefined;
    }
  } else {
    // No viewBox - assume paths are already in pixel coordinates
    innerElement = pathToElement(innerPath, "Inner", "#000");
    outlineElement = outlinePath
      ? pathToOutlineElement(outlinePath, "Outline")
      : undefined;
  }

  // Standardized viewBox: preserve aspect ratio so circles stay circular and signs keep correct proportions.
  // Use 288px on the longer side and scale the other (badges are ~3" wide; signs vary).
  const REF = 288;
  const STANDARD_VIEWBOX_WIDTH =
    widthPx >= heightPx ? REF : Math.round((REF * widthPx) / heightPx);
  const STANDARD_VIEWBOX_HEIGHT =
    heightPx >= widthPx ? REF : Math.round((REF * heightPx) / widthPx);

  console.log(`[templates] designBox for "${c.id}":`, {
    designBox,
    widthPx,
    heightPx,
    standardViewBoxWidth: STANDARD_VIEWBOX_WIDTH,
    standardViewBoxHeight: STANDARD_VIEWBOX_HEIGHT,
  });

  const designerSizeKey = templateIdToDesignerSizeKey(c.id);

  const plateCircle: SignPlateCircle | undefined =
    isSignLikeVariant(variant) && /^circle-/i.test(c.id)
      ? {
          cx: innerPlateBoundsRaw.x + innerPlateBoundsRaw.width / 2,
          cy: innerPlateBoundsRaw.y + innerPlateBoundsRaw.height / 2,
          r:
            Math.min(innerPlateBoundsRaw.width, innerPlateBoundsRaw.height) / 2,
        }
      : undefined;

  const signTextLayout =
    isSignLikeVariant(variant)
      ? resolveSignTextLayout(designBox, c.textLayout, plateCircle, c.id)
      : undefined;

  let plaquePhotoRectPx: LoadedTemplate["plaquePhotoRectPx"];
  if (
    variant === "plaque" &&
    c.plaquePhotoRectNorm &&
    Number.isFinite(widthPx) &&
    Number.isFinite(heightPx)
  ) {
    const r = c.plaquePhotoRectNorm;
    plaquePhotoRectPx = {
      x: r.xNorm * widthPx,
      y: r.yNorm * heightPx,
      width: r.widthNorm * widthPx,
      height: r.heightNorm * heightPx,
    };
  }

  const blankPhotoPlate =
    variant === "badge" ? getBlankPhotoPlateConfig(c.id) ?? undefined : undefined;

  const t: LoadedTemplate = {
    id: c.id,
    name: c.name,
    widthPx,
    heightPx,
    safeInsetPx: c.safeInsetPx ?? Math.round(0.15 * DPI),
    innerElement,
    outlineElement,
    overlayElement,
    designerSizeKey,
    designBox,
    designBoxInnerPlate,
    standardViewBoxWidth: STANDARD_VIEWBOX_WIDTH,
    standardViewBoxHeight: STANDARD_VIEWBOX_HEIGHT,
    svgFile: c.svgFile,
    signTextLayout,
    ...(plaquePhotoRectPx ? { plaquePhotoRectPx } : {}),
    ...(blankPhotoPlate ? { blankPhotoPlate } : {}),
  };

  console.log(
    `[templates] ✓ Loaded template "${c.id}": ${widthPx}×${heightPx}px, designBox:`,
    designBox,
  );

  // NO CACHE - return fresh template every time
  return t;
}

/**
 * Loads a template by ID directly from SVG file.
 * NO CACHING - loads fresh every time.
 */
export async function loadTemplateById(
  id: string,
  variant: DesignerVariant = "badge",
): Promise<LoadedTemplate> {
  const cfgV = getCfgForVariant(variant);
  const found = cfgV.find((t) => t.id === id) || cfgV[0];
  if (!found) {
    throw new Error(`Template not found: ${id}`);
  }
  return await loadOne(found, variant);
}

/**
 * Loads all templates directly from SVG files.
 * NO CACHING - loads fresh every time.
 * Individual template failures are caught and logged, but don't stop other templates from loading.
 */
export async function loadTemplates(
  variant: DesignerVariant = "badge",
): Promise<LoadedTemplate[]> {
  const loaded: LoadedTemplate[] = [];
  const cfgV = getCfgForVariant(variant);
  let firstError: string | null = null;
  console.log(
    `[templates] loadTemplates variant="${variant}" configs=${cfgV.length}`,
  );
  for (const config of cfgV) {
    try {
      const template = await loadOne(config, variant);
      loaded.push(template);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!firstError) firstError = `${config.id}: ${msg}`;
      console.error(
        `[templates] Failed to load template "${config.id}":`,
        error,
      );
      // Continue loading other templates instead of failing completely
    }
  }
  if (loaded.length === 0) {
    const detail = firstError
      ? ` First failure: ${firstError}`
      : " (no configs)";
    throw new Error("[templates] No templates could be loaded." + detail);
  }
  return loaded;
}

/**
 * Clears any cached templates (for development/debugging).
 * Note: This system no longer uses caching, but this function is kept for API compatibility.
 */
export function clearTemplateCache(): void {
  console.log(
    "[templates] Cache clear requested (but no cache exists - templates load fresh from SVG files)",
  );
}

/**
 * Lists all available template options.
 */
export function listTemplateOptions(
  variant: DesignerVariant = "badge",
): { id: string; name: string }[] {
  return getCfgForVariant(variant).map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Template Resolution Utility for Stage 1 Refactor
 * Resolves the appropriate template for a badge.
 */
export async function resolveTemplateForBadge(
  badge: { templateId?: string },
  templates: LoadedTemplate[],
): Promise<LoadedTemplate> {
  // Priority: badge.templateId → templates[0] → fallback
  if (badge.templateId) {
    const template = templates.find((t) => t.id === badge.templateId);
    if (template) return template;
  }

  // Fallback to first available template
  if (templates.length > 0) {
    return templates[0];
  }

  // Ultimate fallback - load rect-1x3
  return await loadTemplateById("rect-1x3");
}
