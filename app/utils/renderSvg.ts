// app/utils/renderSvg.ts
import type { LoadedTemplate } from "~/utils/templates";
import type { Badge, BadgeImage, BadgeLine } from "../types/badge";
import {
  buildSignTextClipPathInnerMarkup,
  createSignTextMeasure,
  isSignLineStrictEmpty,
  layoutSignTextLines,
  measureSignTextPx,
  signCircleExtraInsetPx,
  signHorizontalInsetPx,
  type ResolvedSignTextLayout,
} from "~/utils/signTextLayout";
import {
  resolveSignTextLayoutAndUserLogoSlack,
  resolveSignUserLogoBoundsBox,
} from "~/utils/signLogoTextLayout";
import {
  getDesignerMotifPaths,
  isDesignerMotifId,
  type DesignerMotifId,
} from "~/data/designerMotifs";
import {
  getSignTrimOverlayFragment,
  SIGN_BORDER_OPTION_NONE,
} from "~/data/signBorderTrims";
import { loadFont } from "./fontLoader";
import { BADGE_CONSTANTS } from "../constants/badge";
import { signTemplateSupportsUserLogoUpload } from "~/utils/signLogoPlacement";

type RenderOpts = {
  /**
   * When true (e.g. BadgeSvgRenderer previews, template picker), shape outline uses black (#000) so thumbnails stay visible.
   * Omit/false for exports — outline follows `badge.borderColor` / template defaults.
   */
  showOutline?: boolean;
  /** Optional outline stroke width (e.g. "3" for template picker thumbnails). Default "1.25". */
  outlineStrokeWidth?: string;
  /**
   * When true with showOutline, outline paths use vector-effect="non-scaling-stroke" so stroke stays ~constant
   * device pixels when the plate is scaled from large sign viewBoxes (Classic framed, Portrait, etc.).
   */
  outlineNonScalingStroke?: boolean;
};

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const DEFAULT_PLATE_BG = "#FFFFFF";
const DEFAULT_BORDER = "#FFFFFF";

/** Normalize #RGB / #RRGGBB to uppercase #RRGGBB, or null if not a hex color. */
function tryNormalizeHex(input: string | undefined | null): string | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  if (s[0] !== "#") s = `#${s}`;
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
  const n = tryNormalizeHex(hex);
  if (!n) return 1;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function isLightPlateColor(hex: string | undefined): boolean {
  const n = tryNormalizeHex(hex) ?? tryNormalizeHex(DEFAULT_PLATE_BG)!;
  return relativeLuminance(n) > 0.45;
}

/**
 * Sign Designer overlay + outline use border color; default white-on-white hides trim/art.
 * When border matches plate background (after hex normalize), use Corel-like dark/light trim.
 */
function resolveTrimColors(
  backgroundColor: string | undefined,
  borderColor: string | undefined,
  hasOverlay: boolean,
): { overlayFill: string; outlineStroke: string } {
  const bgRaw = backgroundColor?.trim() || DEFAULT_PLATE_BG;
  const borderRaw = borderColor?.trim() || DEFAULT_BORDER;
  if (!hasOverlay) {
    return {
      overlayFill: borderRaw,
      outlineStroke: borderColor ?? "#111",
    };
  }
  const bgHex = tryNormalizeHex(bgRaw);
  const brHex = tryNormalizeHex(borderRaw);
  const sameHex = bgHex && brHex && bgHex === brHex;
  const sameFallback =
    !bgHex || !brHex
      ? bgRaw.toLowerCase() === borderRaw.toLowerCase()
      : sameHex;
  if (!sameFallback) {
    return { overlayFill: borderRaw, outlineStroke: borderRaw };
  }
  const trim = isLightPlateColor(bgRaw) ? "#282828" : "#FEFEFE";
  return { overlayFill: trim, outlineStroke: trim };
}

function applySignOverlayPathFills(
  fragment: string,
  fillColor: string,
): string {
  if (!fragment) return "";
  return fragment.replace(
    /<path\s+/g,
    `<path fill="${fillColor}" fill-rule="evenodd" stroke="none" `,
  );
}

/** True when trim/border/motif overlay should paint (template must ship overlay markup). */
export function resolveSignBorderOverlayActive(
  badge: Badge,
  template: LoadedTemplate,
): boolean {
  if (!template.overlayElement?.trim()) return false;
  const opt = badge.signBorderOptionId;
  if (opt === SIGN_BORDER_OPTION_NONE) return false;
  if (opt !== undefined && opt !== SIGN_BORDER_OPTION_NONE) return true;
  // No explicit option yet: respect legacy `signBorderEnabled` only
  if (badge.signBorderEnabled === false) return false;
  if (badge.signBorderEnabled === true) return true;
  return false;
}

export function getEffectiveDesignBox(
  template: LoadedTemplate,
  badge: Badge,
): { x: number; y: number; width: number; height: number } {
  if (resolveSignBorderOverlayActive(badge, template)) {
    return template.designBox;
  }
  return template.designBoxInnerPlate ?? template.designBox;
}

/**
 * Sign text layout after reserving space for a user logo (editor + renderSvg single source of truth).
 */
export function getEffectiveSignTextLayoutForBadge(
  template: LoadedTemplate,
  badge: Badge,
): ResolvedSignTextLayout | undefined {
  if (!template.signTextLayout) return undefined;
  const trimBox = getEffectiveDesignBox(template, badge);
  const borderOn = resolveSignBorderOverlayActive(badge, template);
  const logoForLayout = signTemplateSupportsUserLogoUpload(template.id)
    ? badge.logo
    : undefined;
  const logoBoundsBox = resolveSignUserLogoBoundsBox(
    template,
    trimBox,
    borderOn,
  );
  return resolveSignTextLayoutAndUserLogoSlack(
    template.signTextLayout,
    trimBox,
    logoForLayout,
    template.signTextLayout.plateCircle,
    logoBoundsBox,
    badge.lines,
    createSignTextMeasure(),
  ).layout;
}

function resolveSignOverlayMarkup(
  template: LoadedTemplate,
  badge: Badge,
): string {
  const styleId =
    badge.signBorderOptionId != null &&
    badge.signBorderOptionId !== SIGN_BORDER_OPTION_NONE
      ? badge.signBorderOptionId
      : badge.signBorderStyleId ?? "default";
  const fromRegistry = getSignTrimOverlayFragment(template.id, styleId);
  if (fromRegistry?.trim()) return fromRegistry.trim();
  return template.overlayElement?.trim() ?? "";
}

/** Border-only overlay + motif library paths for sign Designer templates. */
function buildSignDesignerOverlayLayer(
  template: LoadedTemplate,
  badge: Badge,
  fillColor: string,
  borderMarkup?: string | null,
): string {
  const borderBase =
    (borderMarkup?.trim() || template.overlayElement)?.trim() ?? "";
  if (!borderBase) return "";
  if (!template.designerSizeKey) {
    return applySignOverlayPathFills(borderBase, fillColor);
  }
  let motifId: DesignerMotifId = "heart";
  if (isDesignerMotifId(badge.designerMotif)) {
    motifId = badge.designerMotif;
  }
  const motifFrag = getDesignerMotifPaths(template.designerSizeKey, motifId);
  const borderLayer = applySignOverlayPathFills(borderBase, fillColor);
  const motifLayer = applySignOverlayPathFills(motifFrag, fillColor);
  if (!motifLayer) return borderLayer;
  return borderLayer.replace(/<\/g>\s*$/i, `${motifLayer}</g>`);
}

type AnyLine = {
  id?: string;
  text?: string;
  // New normalized coordinates (preferred)
  xNorm?: number;
  yNorm?: number; // 0..1 normalized within designBox
  sizeNorm?: number; // 0..1 relative to designBox.height
  // Legacy absolute coordinates (for backward compatibility)
  x?: number;
  y?: number; // legacy absolute px
  xPx?: number;
  yPx?: number; // absolute px alt
  fontSize?: number;
  fontSizeRel?: number; // absolute px OR relative to designBox.height
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  alignment?: "left" | "center" | "right"; // alternative property name
};

function toPx(
  line: AnyLine,
  designBox: { x: number; y: number; width: number; height: number },
  template?: LoadedTemplate,
): { x: number; y: number } {
  // Prefer normalized coordinates (new preferred method)
  if (line.xNorm != null && line.yNorm != null) {
    // Calculate base x position from normalized coordinate
    let x = designBox.x + line.xNorm * designBox.width;

    // Adjust x position based on alignment for proper text-anchor behavior
    const alignment = line.align || "center";
    if (alignment === "left") x = designBox.x;
    else if (alignment === "right") x = designBox.x + designBox.width;

    // y position from normalized coordinates
    let y = designBox.y + line.yNorm * designBox.height;

    // Apply vertical visual offset for house template if desired
    if (template?.id?.startsWith("house")) {
      y += designBox.height * 0.06; // push text slightly down
    }

    return { x, y };
  }

  // Fallback to absolute coordinates (backward compatibility)
  if (
    line.xPx != null ||
    line.yPx != null ||
    line.x != null ||
    line.y != null
  ) {
    return { x: line.xPx ?? line.x ?? 0, y: line.yPx ?? line.y ?? 0 };
  }

  // Default to center if no coordinates provided
  const alignment = line.align || "center";
  let defaultX = designBox.x + designBox.width * 0.5;
  if (alignment === "left") defaultX = designBox.x;
  else if (alignment === "right") defaultX = designBox.x + designBox.width;

  // Default Y with optional house offset
  let defaultY = designBox.y + designBox.height * 0.5; // geometric center
  if (template?.id?.startsWith("house")) {
    defaultY += designBox.height * 0.06; // push text slightly down
  } else {
    defaultY += designBox.height * 0.1; // small default push (was 0.6)
  }

  return { x: defaultX, y: defaultY };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function measureTextPx(
  text: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: string,
  fontStyle: string,
): { width: number; height: number; ascent: number; descent: number } {
  // SSR / non-browser fallback: rough estimates
  if (typeof document === "undefined") {
    const t = text || " ";
    const ascent = fontSizePx * 0.8;
    const descent = fontSizePx * 0.2;
    return {
      width: t.length * fontSizePx * 0.6,
      height: ascent + descent,
      ascent,
      descent,
    };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const t = text || " ";
    const ascent = fontSizePx * 0.8;
    const descent = fontSizePx * 0.2;
    return {
      width: t.length * fontSizePx * 0.6,
      height: ascent + descent,
      ascent,
      descent,
    };
  }

  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const metrics = ctx.measureText(text || " ");

  const width = Math.max(1, metrics.width);
  const ascent = (metrics as any).actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = (metrics as any).actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const height = Math.max(1, ascent + descent);

  return { width, height, ascent, descent };
}

/**
 * Calculates optimal text layout with uniform spacing, proportional scaling, and boundary constraints
 */
function calculateTextLayout(
  lines: AnyLine[],
  designBox: { x: number; y: number; width: number; height: number },
  template: LoadedTemplate,
  fontMappings: Map<string, string> | undefined,
  badge: Badge,
  /** When already computed for clip/logo resolve; avoids duplicate expensive work per SVG render. */
  precResolvedSignLayout?: ResolvedSignTextLayout,
): Array<{
  line: AnyLine;
  x: number;
  y: number;
  fontSize: number;
  anchor: string;
  familyRaw: string;
  familyEscaped: string;
  fontWeight: string;
  fontStyle: string;
}> {
  if (lines.length === 0) return [];

  if (template.signTextLayout) {
    const signLayout =
      precResolvedSignLayout ??
      getEffectiveSignTextLayoutForBadge(template, badge)!;
    const laid = layoutSignTextLines(
      lines as BadgeLine[],
      signLayout,
      (args) =>
        measureSignTextPx(
          args.text,
          fontMappings?.get(args.fontFamily) ?? args.fontFamily,
          args.fontSizePx,
          args.fontWeight,
          args.fontStyle,
        ),
      esc,
    );
    return laid.filter((row) => !isSignLineStrictEmpty(row.line.text));
  }

  const MIN_FONT = BADGE_CONSTANTS.MIN_FONT_SIZE;
  const MAX_FONT = BADGE_CONSTANTS.MAX_FONT_SIZE;
  const INSET_PX = 0.1 * 96; // 0.1" at 96 DPI
  const EXTRA_TOP_PX = 4; // try 4–8

  // Available text area (with inset for padding)
  const textAreaLeft = designBox.x + INSET_PX;
  const textAreaTop = designBox.y + INSET_PX + EXTRA_TOP_PX;
  const textAreaRight = designBox.x + designBox.width - INSET_PX;
  const textAreaBottom = designBox.y + designBox.height - INSET_PX;
  const textAreaWidth = textAreaRight - textAreaLeft;
  const textAreaHeight = textAreaBottom - textAreaTop;

  // Uniform spacing between lines (7% of design box height)
  const UNIFORM_SPACING = designBox.height * 0.07;

  // Step 1: Calculate requested sizes for all lines
  const lineData = lines.map((line, i) => {
    const baseSize = line.sizeNorm
      ? Math.round(line.sizeNorm * designBox.height)
      : line.fontSizeRel
      ? Math.round(line.fontSizeRel * designBox.height)
      : line.fontSize ?? Math.round(designBox.height * (i === 0 ? 0.23 : 0.17));

    const requestedSize = clamp(baseSize, MIN_FONT, MAX_FONT);
    const alignment = line.align || line.alignment || "center";
    const anchor =
      alignment === "center"
        ? "middle"
        : alignment === "right"
        ? "end"
        : "start";

    const originalFamily = line.fontFamily || "Inter, ui-sans-serif, system-ui";
    const familyRaw = fontMappings?.get(originalFamily) || originalFamily;
    const fontWeight = line.bold ? "bold" : "normal";
    const fontStyle = line.italic ? "italic" : "normal";

    return {
      line,
      requestedSize,
      anchor,
      familyRaw,
      fontWeight,
      fontStyle,
    };
  });

  // Step 2: Measure all lines at their requested sizes
  const measuredLines = lineData.map((item) => {
    const metrics = measureTextPx(
      item.line.text || "",
      item.familyRaw,
      item.requestedSize,
      item.fontWeight,
      item.fontStyle,
    );
    return {
      ...item,
      metrics,
    };
  });

  // Step 3: Calculate total vertical space needed with uniform spacing
  const totalVerticalSpace = measuredLines.reduce((sum, item, index) => {
    sum += item.metrics.height;
    if (index < measuredLines.length - 1) {
      sum += UNIFORM_SPACING;
    }
    return sum;
  }, 0);

  // Step 4: Calculate vertical scale factor if needed
  let verticalScale = 1;
  if (totalVerticalSpace > textAreaHeight) {
    verticalScale = textAreaHeight / totalVerticalSpace;
  }

  // Step 5: For each line, calculate horizontal scale factor
  const scaledLines = measuredLines.map((item) => {
    // First apply vertical scaling
    let scaledSize = item.requestedSize * verticalScale;

    // Then check horizontal fit
    const scaledMetrics = measureTextPx(
      item.line.text || "",
      item.familyRaw,
      scaledSize,
      item.fontWeight,
      item.fontStyle,
    );

    // Calculate available width based on alignment
    // All alignments can use the full text area width since we'll position them correctly
    const availableWidth = textAreaWidth;

    // Calculate horizontal scale if needed
    let horizontalScale = 1;
    if (scaledMetrics.width > availableWidth) {
      horizontalScale = availableWidth / scaledMetrics.width;
    }

    // Use the minimum of vertical and horizontal scales
    const finalScale = Math.min(verticalScale, horizontalScale);
    const finalSize = clamp(
      item.requestedSize * finalScale,
      MIN_FONT,
      MAX_FONT,
    );

    return {
      ...item,
      finalSize,
      finalScale,
    };
  });

  // Step 6–7: Build layout, then shrink uniformly until it fits (robust against font metric mismatch)
  const SAFETY_PX = 2; // <-- small extra margin to avoid “1px clipped” cases
  const MAX_ITERS = 12;
  const SHRINK_STEP = 0.97; // shrink 3% each retry

  // Start with the scales you already computed in Step 5
  let uniformScale = 1;

  // Helper builds positioned lines for a given extra uniformScale
  const buildPositioned = (extraScale: number) => {
    const metricsArr = scaledLines.map((item) =>
      measureTextPx(
        item.line.text || "",
        item.familyRaw,
        clamp(item.finalSize * extraScale, MIN_FONT, MAX_FONT),
        item.fontWeight,
        item.fontStyle,
      ),
    );

    const totalHeight = metricsArr.reduce((sum, m, idx) => {
      sum += m.height;
      if (idx < metricsArr.length - 1) sum += UNIFORM_SPACING;
      return sum;
    }, 0);

    const startY = textAreaTop + (textAreaHeight - totalHeight) / 2;

    let currentY = startY;
    const positioned = scaledLines.map((item, idx) => {
      const m = metricsArr[idx];

      // y is the visual middle because you render with dominant-baseline="middle"
      const y = currentY + m.height / 2;

      let x: number;
      if (item.anchor === "middle") x = textAreaLeft + textAreaWidth / 2;
      else if (item.anchor === "start") x = textAreaLeft;
      else x = textAreaRight;

      currentY +=
        m.height + (idx < scaledLines.length - 1 ? UNIFORM_SPACING : 0);

      return {
        line: item.line,
        x,
        y,
        fontSize: clamp(item.finalSize * extraScale, MIN_FONT, MAX_FONT),
        anchor: item.anchor,
        familyRaw: item.familyRaw,
        familyEscaped: esc(item.familyRaw),
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle,
      };
    });

    return { positioned, metricsArr };
  };

  let positionedLines: ReturnType<typeof buildPositioned>["positioned"] = [];
  let finalMetrics: ReturnType<typeof buildPositioned>["metricsArr"] = [];

  for (let i = 0; i < MAX_ITERS; i++) {
    const built = buildPositioned(uniformScale);
    positionedLines = built.positioned;
    finalMetrics = built.metricsArr;

    // Compute glyph bounds using ascent/descent around the visual middle
    const tops = positionedLines.map((p, idx) => {
      const m = finalMetrics[idx];
      const half = (m.ascent + m.descent) / 2;
      return p.y - half;
    });

    const bottoms = positionedLines.map((p, idx) => {
      const m = finalMetrics[idx];
      const half = (m.ascent + m.descent) / 2;
      return p.y + half;
    });

    const minTop = Math.min(...tops);
    const maxBottom = Math.max(...bottoms);

    const topOverflow = textAreaTop + SAFETY_PX - minTop; // positive means too high
    const bottomOverflow = maxBottom - (textAreaBottom - SAFETY_PX); // positive means too low

    if (topOverflow <= 0 && bottomOverflow <= 0) {
      // Fits! Done.
      return positionedLines;
    }

    // If it doesn't fit, shrink uniformly and retry
    uniformScale *= SHRINK_STEP;
  }

  // Fallback: return last attempt (should be close even if fonts differ slightly)
  return positionedLines;
}

// TEMP: force BG image sizing to prove rendering path works
const FORCE_BG_SIZE_DEBUG = false;

function renderBg(
  img: BadgeImage | undefined,
  designBox: { x: number; y: number; width: number; height: number },
): string {
  if (!img || !img.src) {
    // No background image, return empty string (background color will be handled separately)
    return "";
  }

  // Hard override while debugging: force the image to cover the whole designBox
  const iw = FORCE_BG_SIZE_DEBUG
    ? designBox.width
    : Math.max(1, img.widthPx ?? designBox.width);
  const ih = FORCE_BG_SIZE_DEBUG
    ? designBox.height
    : Math.max(1, img.heightPx ?? designBox.height);
  const scale = FORCE_BG_SIZE_DEBUG ? 1 : img.scale ?? 1;
  const offX = img.offsetX ?? 0;
  const offY = img.offsetY ?? 0;

  // Center the image within the designBox
  const centerX = designBox.x + designBox.width / 2;
  const centerY = designBox.y + designBox.height / 2;
  const transform = `translate(${centerX + offX}, ${
    centerY + offY
  }) translate(${iw / 2}, ${ih / 2}) scale(${scale}) translate(${-iw / 2}, ${
    -ih / 2
  })`;

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

/** Sign Designer user logo: fitted rect + meet. Non-sign: legacy absolute positioning. */
function renderUserLogoLayer(
  logo: BadgeImage | undefined,
  template: LoadedTemplate,
  badge: Badge,
  designBox: { x: number; y: number; width: number; height: number },
): string {
  if (!logo?.src?.trim()) return "";
  if (template.signTextLayout) {
    if (!signTemplateSupportsUserLogoUpload(template.id)) return "";
    const trimBox = getEffectiveDesignBox(template, badge);
    const borderOn = resolveSignBorderOverlayActive(badge, template);
    const logoBoundsBox = resolveSignUserLogoBoundsBox(
      template,
      trimBox,
      borderOn,
    );
    const { draw: rect } = resolveSignTextLayoutAndUserLogoSlack(
      template.signTextLayout,
      trimBox,
      logo,
      template.signTextLayout.plateCircle,
      logoBoundsBox,
      badge.lines,
      createSignTextMeasure(),
    );
    if (!rect) return "";
    const src = esc(logo.src);
    return `
    <image href="${src}" xlink:href="${src}"
      x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"
      preserveAspectRatio="xMidYMid meet"
      style="image-rendering:optimizeQuality" />`;
  }
  const lw = Math.max(1, logo.widthPx ?? Math.round(designBox.height * 0.3));
  const lh = Math.max(1, logo.heightPx ?? Math.round(designBox.height * 0.3));
  const x = logo.x ?? designBox.x + designBox.width * 0.1;
  const y = logo.y ?? designBox.y + designBox.height * 0.2;
  const s = logo.scale ?? 1;
  const src = esc(logo.src);
  return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <image href="${src}" x="0" y="0" width="${lw}" height="${lh}" preserveAspectRatio="none"
             style="image-rendering:optimizeQuality" />
    </g>
  `;
}

/**
 * Remove fill/stroke attributes from all descendant SVG shapes
 * and apply correct display attributes.
 * Uses DOM parsing for robust attribute manipulation.
 */
function prepareElementForOutline(
  element: string,
  fill: string,
  stroke: string,
  strokeWidth: string,
  nonScalingStroke?: boolean,
): string {
  const vectorEffectAttr = nonScalingStroke
    ? ` vector-effect="non-scaling-stroke"`
    : "";
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parser = new DOMParser();
    // Wrap element in a temporary container for parsing
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${element}</svg>`;
    const doc = parser.parseFromString(wrapped, "image/svg+xml");

    // Find all relevant SVG shape elements and update their attributes
    // This handles both direct elements and nested structures
    doc
      .querySelectorAll(
        "[id='Inner'], [id='inner'], path, rect, ellipse, circle, polygon, polyline",
      )
      .forEach((el) => {
        el.removeAttribute("class");
        el.removeAttribute("style");
        el.removeAttribute("fill");
        el.removeAttribute("stroke");
        el.removeAttribute("stroke-width");
        el.setAttribute("fill", fill);
        el.setAttribute("stroke", stroke);
        el.setAttribute("stroke-width", strokeWidth);
        if (nonScalingStroke) {
          el.setAttribute("vector-effect", "non-scaling-stroke");
        } else {
          el.removeAttribute("vector-effect");
        }
      });

    // Extract the inner element back out
    const svgEl = doc.documentElement;
    return svgEl.innerHTML;
  }

  // Fallback for SSR: use regex (less robust but works)
  let cleaned = element.replace(/\s+class\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+style\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+fill\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+stroke-width\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+vector-effect\s*=\s*["'][^"']*["']/gi, "");
  return cleaned.replace(
    /\/?>$/,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${vectorEffectAttr}/>`,
  );
}

export function renderBadgeToSvgString(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {},
): string {
  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const PADDING_PX = 24;
  // ViewBox must match content coordinates: innerElement/designBox are in template.widthPx × template.heightPx space.
  // Using widthPx/heightPx lets large signs fit fully; SVG then scales to container (preview) with width/height="100%".
  const W = template.widthPx + PADDING_PX * 2;
  const H = template.heightPx + PADDING_PX * 2;
  const designBox = getEffectiveDesignBox(template, badge);
  const overlayActive = resolveSignBorderOverlayActive(badge, template);
  const overlayMarkup = resolveSignOverlayMarkup(template, badge);
  const paintOverlay = overlayActive && Boolean(overlayMarkup);

  const clipId = `badge-clip-${
    badge.id || Math.random().toString(36).substring(7)
  }`;

  // SINGLE LAYER APPROACH: Use inner path directly for background fill
  // Handle both direct path elements and paths wrapped in <g transform> tags
  // Extract the path, update fill, remove stroke, then reconstruct structure
  let innerPathWithFill: string;

  // Check if innerElement is wrapped in a <g transform> tag (more robust regex)
  // Match transform attribute with any whitespace, and capture content between tags
  // Use [\s\S] instead of . to match newlines, and /i flag for case-insensitive
  const gTransformMatch = template.innerElement.match(
    /<g[^>]*\btransform\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/g>/i,
  );

  if (gTransformMatch && gTransformMatch[2].trim()) {
    // Path is wrapped in transform group - extract path, update fill, reconstruct
    const transform = gTransformMatch[1].trim();
    const pathContent = gTransformMatch[2].trim();

    // Update fill and remove stroke from the path content (more robust regex)
    let updatedPath = pathContent.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${badge.backgroundColor || "#FFFFFF"}"`,
    );
    updatedPath = updatedPath.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, "");
    updatedPath = updatedPath.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );

    // Reconstruct with transform wrapper
    innerPathWithFill = `<g transform="${transform}">${updatedPath}</g>`;
  } else {
    // Direct path element - update fill and remove stroke (more robust regex)
    innerPathWithFill = template.innerElement.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${badge.backgroundColor || "#FFFFFF"}"`,
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke\s*=\s*["'][^"']*["']/gi,
      "",
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );
  }

  // Extract path data from inner element for clipPath
  // The inner element might be wrapped in a <g transform> tag, so we need to extract just the path
  let innerPathData = template.innerElement;
  // Remove <g> wrapper if present (handles both opening and closing tags)
  const gMatch = innerPathData.match(/<g[^>]*>(.*?)<\/g>/s);
  if (gMatch) {
    innerPathData = gMatch[1];
  }
  // Extract the path element itself (with all attributes) for clipPath
  // If it's already a path, use it directly; otherwise extract path from within
  const pathMatch = innerPathData.match(/<path[^>]*>/);
  if (!pathMatch) {
    // Fallback: try to extract d attribute and reconstruct
    const dMatch = innerPathData.match(/d=["']([^"']+)["']/);
    if (dMatch) {
      innerPathData = `<path d="${dMatch[1]}"/>`;
    }
  }

  const effectiveSignLayout = template.signTextLayout
    ? getEffectiveSignTextLayoutForBadge(template, badge)
    : undefined;
  const layoutForTextClip = effectiveSignLayout ?? template.signTextLayout;
  const textClipW = layoutForTextClip?.clipRect?.width ?? designBox.width;
  const curveTextClip = layoutForTextClip?.plateCircle
    ? signCircleExtraInsetPx(layoutForTextClip.plateCircle.r)
    : 0;
  const textClipPath = buildSignTextClipPathInnerMarkup(
    layoutForTextClip,
    designBox,
    signHorizontalInsetPx(textClipW) + curveTextClip,
  );

  // Background image (if present)
  const bgImageLayer = badge.backgroundImage
    ? renderBg(badge.backgroundImage, designBox)
    : "";

  // Text rendering with uniform spacing and proportional scaling
  const lineLayout = calculateTextLayout(
    badge.lines || [],
    designBox,
    template,
    undefined,
    badge,
    effectiveSignLayout,
  );

  // Render text elements
  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";

      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${
                item.familyEscaped
              }" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  // Text is already positioned within bounds, but keep clipPath as safety net
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const trimColors = resolveTrimColors(
    badge.backgroundColor,
    badge.borderColor,
    paintOverlay,
  );

  // Outline for border (no fill, stroke only). On-screen preview (showOutline) uses true black so template
  // picker thumbnails match; exports omit showOutline and keep border/trim colors.
  const outlineColor =
    opts.showOutline === true
      ? "#000000"
      : paintOverlay
      ? trimColors.outlineStroke
      : badge.borderColor ?? "#111";
  const outlineWidth = opts.outlineStrokeWidth ?? "1.25";
  const outlineNonScaling = opts.outlineNonScalingStroke === true;
  const outline = template.outlineElement
    ? prepareElementForOutline(
        template.outlineElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      )
    : prepareElementForOutline(
        template.innerElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      );

  // Overlay layer (sign Designer trim/swirls): render only when present, with border color
  const borderColorForOverlay = paintOverlay
    ? trimColors.overlayFill
    : badge.borderColor ?? "#FFFFFF";
  const overlayLayer = paintOverlay
    ? template.designerSizeKey
      ? buildSignDesignerOverlayLayer(
          template,
          badge,
          borderColorForOverlay,
          overlayMarkup,
        )
      : overlayMarkup.replace(
          /<path\s+/g,
          `<path fill="${borderColorForOverlay}" fill-rule="evenodd" stroke="none" `,
        )
    : "";

  if (paintOverlay && template.id.startsWith("classic-framed-")) {
    console.log("[renderSvg] Classic Framed render:", {
      templateId: template.id,
      innerGetsBackgroundColor: badge.backgroundColor ?? "#FFFFFF",
      overlayGetsBorderColor: borderColorForOverlay,
    });
  }

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  // Use the textClipPath already defined above (with CLIP_PADDING)
  const textClipPathRect = textClipPath;

  const userLogoRaw = renderUserLogoLayer(
    badge.logo,
    template,
    badge,
    designBox,
  );
  const userLogoLayer =
    innerPathData && userLogoRaw.trim() !== ""
      ? `<g clip-path="url(#${clipId})">${userLogoRaw}</g>`
      : userLogoRaw;

  return `${svgOpen}
  <defs>
    ${
      innerPathData
        ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${innerPathData}
    </clipPath>`
        : ""
    }
    <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
      ${textClipPathRect}
    </clipPath>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPathWithFill}
    <!-- Background image (if present) -->
    ${bgImageLayer}
    <!-- User logo (sign): clipped to die; under border overlay and text -->
    ${userLogoLayer}
    ${overlayLayer}
    <!-- Text -->
    ${text}
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}

// Async version that embeds fonts for consistent rendering across all export formats
export async function renderBadgeToSvgStringWithFonts(
  badge: Badge,
  template: LoadedTemplate,
  opts: RenderOpts = {},
): Promise<string> {
  // Add padding around badge for better visual spacing (0.25" = 24px at 96 DPI)
  const PADDING_PX = 24;
  // ViewBox must match content coordinates (widthPx × heightPx) so full design fits; preview scales via width/height="100%".
  const W = template.widthPx + PADDING_PX * 2;
  const H = template.heightPx + PADDING_PX * 2;
  const designBox = getEffectiveDesignBox(template, badge);
  const overlayActive = resolveSignBorderOverlayActive(badge, template);
  const overlayMarkup = resolveSignOverlayMarkup(template, badge);
  const paintOverlay = overlayActive && Boolean(overlayMarkup);

  // Collect all unique font families used in the badge
  const fontFamilies = new Set<string>();
  (badge.lines || []).forEach((line) => {
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
        const embeddedName = `Embedded${fontFamily.replace(/\s+/g, "")}`;
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

  const clipId = `badge-clip-${
    badge.id || Math.random().toString(36).substring(7)
  }`;

  // SINGLE LAYER APPROACH: Use inner path directly for background fill
  // Handle both direct path elements and paths wrapped in <g transform> tags
  // Extract the path, update fill, remove stroke, then reconstruct structure
  let innerPathWithFill: string;

  // Check if innerElement is wrapped in a <g transform> tag (more robust regex)
  // Match transform attribute with any whitespace, and capture content between tags
  // Use [\s\S] instead of . to match newlines, and /i flag for case-insensitive
  const gTransformMatch = template.innerElement.match(
    /<g[^>]*\btransform\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/g>/i,
  );

  if (gTransformMatch && gTransformMatch[2].trim()) {
    // Path is wrapped in transform group - extract path, update fill, reconstruct
    const transform = gTransformMatch[1].trim();
    const pathContent = gTransformMatch[2].trim();

    // Update fill and remove stroke from the path content (more robust regex)
    let updatedPath = pathContent.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${badge.backgroundColor || "#FFFFFF"}"`,
    );
    updatedPath = updatedPath.replace(/\s+stroke\s*=\s*["'][^"']*["']/gi, "");
    updatedPath = updatedPath.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );

    // Reconstruct with transform wrapper
    innerPathWithFill = `<g transform="${transform}">${updatedPath}</g>`;
  } else {
    // Direct path element - update fill and remove stroke (more robust regex)
    innerPathWithFill = template.innerElement.replace(
      /fill\s*=\s*["'][^"']*["']/i,
      `fill="${badge.backgroundColor || "#FFFFFF"}"`,
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke\s*=\s*["'][^"']*["']/gi,
      "",
    );
    innerPathWithFill = innerPathWithFill.replace(
      /\s+stroke-width\s*=\s*["'][^"']*["']/gi,
      "",
    );
  }

  // Extract path data from inner element for clipPath
  // The inner element might be wrapped in a <g transform> tag, so we need to extract just the path
  let innerPathData = template.innerElement;
  // Remove <g> wrapper if present (handles both opening and closing tags)
  const gMatch = innerPathData.match(/<g[^>]*>(.*?)<\/g>/s);
  if (gMatch) {
    innerPathData = gMatch[1];
  }
  // Extract the path element itself (with all attributes) for clipPath
  // If it's already a path, use it directly; otherwise extract path from within
  const pathMatch = innerPathData.match(/<path[^>]*>/);
  if (!pathMatch) {
    // Fallback: try to extract d attribute and reconstruct
    const dMatch = innerPathData.match(/d=["']([^"']+)["']/);
    if (dMatch) {
      innerPathData = `<path d="${dMatch[1]}"/>`;
    }
  }

  const effectiveSignLayoutWithFonts = template.signTextLayout
    ? getEffectiveSignTextLayoutForBadge(template, badge)
    : undefined;
  const layoutForTextClipFonts =
    effectiveSignLayoutWithFonts ?? template.signTextLayout;
  const textClipWFonts =
    layoutForTextClipFonts?.clipRect?.width ?? designBox.width;
  const curveTextClipFonts = layoutForTextClipFonts?.plateCircle
    ? signCircleExtraInsetPx(layoutForTextClipFonts.plateCircle.r)
    : 0;
  const textClipPath = buildSignTextClipPathInnerMarkup(
    layoutForTextClipFonts,
    designBox,
    signHorizontalInsetPx(textClipWFonts) + curveTextClipFonts,
  );

  // Background image (if present) - rendered on top of filled inner path
  const bgImageLayer = badge.backgroundImage
    ? renderBg(badge.backgroundImage, designBox)
    : "";

  // Text rendering with embedded fonts, uniform spacing and proportional scaling
  const lineLayout = calculateTextLayout(
    badge.lines || [],
    designBox,
    template,
    fontMappings,
    badge,
    effectiveSignLayoutWithFonts,
  );

  // Render text elements
  const textElements = lineLayout
    .map((item) => {
      const line = item.line;
      const color = line.color || "#000";
      const textDecoration = line.underline ? "underline" : "none";

      return `<text x="${item.x}" y="${item.y}" font-size="${
        item.fontSize
      }" text-anchor="${item.anchor}"
              dominant-baseline="middle" font-family="${
                item.familyEscaped
              }" fill="${color}"
              font-weight="${item.fontWeight}"
              font-style="${item.fontStyle}"
              text-decoration="${textDecoration}">${esc(
        line.text || "",
      )}</text>`;
    })
    .join("");

  // Text is already positioned within bounds, but keep clipPath as safety net
  const text = `<g clip-path="url(#${clipId}-text)">${textElements}</g>`;

  const trimColors = resolveTrimColors(
    badge.backgroundColor,
    badge.borderColor,
    paintOverlay,
  );

  // Outline for border (no fill, stroke only). On-screen preview (showOutline) uses true black so template
  // picker thumbnails match; exports omit showOutline and keep border/trim colors.
  const outlineColor =
    opts.showOutline === true
      ? "#000000"
      : paintOverlay
      ? trimColors.outlineStroke
      : badge.borderColor ?? "#111";
  const outlineWidth = opts.outlineStrokeWidth ?? "1.25";
  const outlineNonScaling = opts.outlineNonScalingStroke === true;
  const outline = template.outlineElement
    ? prepareElementForOutline(
        template.outlineElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      )
    : prepareElementForOutline(
        template.innerElement,
        "none",
        outlineColor,
        outlineWidth,
        outlineNonScaling,
      );

  // Overlay layer (sign Designer trim/swirls): render only when present, with border color
  const borderColorForOverlay = paintOverlay
    ? trimColors.overlayFill
    : badge.borderColor ?? "#FFFFFF";
  const overlayLayer = paintOverlay
    ? template.designerSizeKey
      ? buildSignDesignerOverlayLayer(
          template,
          badge,
          borderColorForOverlay,
          overlayMarkup,
        )
      : overlayMarkup.replace(
          /<path\s+/g,
          `<path fill="${borderColorForOverlay}" fill-rule="evenodd" stroke="none" `,
        )
    : "";

  if (paintOverlay && template.id.startsWith("classic-framed-")) {
    console.log("[renderSvg] Classic Framed render:", {
      templateId: template.id,
      innerGetsBackgroundColor: badge.backgroundColor ?? "#FFFFFF",
      overlayGetsBorderColor: borderColorForOverlay,
    });
  }

  const svgOpen = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">`;

  const userLogoRaw = renderUserLogoLayer(
    badge.logo,
    template,
    badge,
    designBox,
  );
  const userLogoLayer =
    innerPathData && userLogoRaw.trim() !== ""
      ? `<g clip-path="url(#${clipId})">${userLogoRaw}</g>`
      : userLogoRaw;

  return `${svgOpen}
  <defs>
    <style type="text/css">
      ${fontDefs.join("\n")}
    </style>
    ${
      innerPathData
        ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      ${innerPathData}
    </clipPath>`
        : ""
    }
    <clipPath id="${clipId}-text" clipPathUnits="userSpaceOnUse">
      ${textClipPath}
    </clipPath>
  </defs>

  <!-- Single layer: padding offset -->
  <g transform="translate(${PADDING_PX}, ${PADDING_PX})">
    <!-- Background: inner path filled with color (defines editable area) -->
    ${innerPathWithFill}
    ${bgImageLayer}
    ${userLogoLayer}
    ${overlayLayer}
    ${text}
    <!-- Outline border on top -->
    ${outline}
  </g>
</svg>`.trim();
}
