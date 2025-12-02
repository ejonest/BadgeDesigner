// app/utils/generateSvgBadgeShape.ts
/**
 * Programmatic Badge SVG Shape Generation
 * 
 * This module replaces template-file lookup with direct SVG generation.
 * Paths are extracted from engineering SVGs or inferred from measurements.
 * 
 * NOTE: This is the NEW system meant to replace app/utils/templates.ts.
 * Currently, both systems coexist:
 * - Old system (templates.ts): Loads from SVG files, used by all components
 * - New system (this file): Programmatic generation, currently test-only
 * 
 * Template IDs match between systems (e.g., "rect-1x3") for eventual migration.
 * No naming conflicts exist - different function/type names.
 */

export type BadgeShapeDefinition = {
  name: string;         // Display name for the template
  outlinePath?: string; // SVG path string for physical edge (optional, falls back to inner if not provided)
  innerPath: string;    // SVG path string for content/text area (required)
  viewBox: string;      // SVG viewBox string (e.g., "0 0 3150 1150")
  widthInches: number;  // Physical width in inches
  heightInches: number; // Physical height in inches
  safeInsetPx?: number; // Safe inset in pixels (for UI guidance)
};

/**
 * Badge shape definitions extracted from template SVGs.
 * Paths are in their original coordinate systems matching the viewBox.
 */
export const BADGE_SHAPE_PATHS: Record<string, BadgeShapeDefinition> = {
  // Rounded Rectangle 1×3 (3in x 1in)
  "rect-1x3": {
    name: "Rounded Rectangle 1×3",
    outlinePath: "M2820.92 78.48c138.19,0 250.61,112.43 250.61,250.61l0 491.83c0,138.19 -112.43,250.61 -250.61,250.61l-2491.83 0c-138.18,0 -250.61,-112.43 -250.61,-250.61l0 -495.92c0,-135.93 110.6,-246.53 246.53,-246.53l2495.92 0 0 0 -0.01 0.01zm0 -3.47l-2495.92 0c-138.07,0 -250,111.93 -250,250l0 495.92c0,140.33 113.76,254.08 254.08,254.08l2491.83 0c140.33,0 254.08,-113.76 254.08,-254.08l0 -491.83c0,-140.33 -113.76,-254.08 -254.08,-254.08l0 0 0.01 -0.01z",
    innerPath: "M2819.47 102.78l-2493.03 0c-123.32,0 -223.67,100.09 -223.67,223.12l0 494.13c0,125.28 102.17,227.19 227.75,227.19l2488.94 0c125.58,0 227.75,-101.9 227.75,-227.19l0 -490.06c0,-125.26 -102.15,-227.19 -227.75,-227.19l0.01 0z",
    viewBox: "0 0 3150 1150",
    widthInches: 3.0,
    heightInches: 1.0,
    safeInsetPx: 6,
  },

  // Rounded Rectangle 1.5×3 (3in x 1.5in)
  "rect-1_5x3": {
    name: "Rounded Rectangle 1.5×3",
    outlinePath: "M2825 78.48c135.93,0 246.53,110.6 246.53,246.53l0 1000c0,135.93 -110.6,246.53 -246.53,246.53l-2500 0c-135.93,0 -246.53,-110.6 -246.53,-246.53l0 -1000c0,-135.93 110.6,-246.53 246.53,-246.53l2500 0 0 0zm0 -3.47l-2500 0c-138.07,0 -250,111.93 -250,250l0 1000c0,138.07 111.93,250 250,250l2500 0c138.07,0 250,-111.93 250,-250l0 -1000c0,-138.07 -111.93,-250 -250,-250l0 0z",
    innerPath: "M2823.55 102.79l-2497.11 0c-123.32,0 -223.67,100.22 -223.67,223.4l0 997.64c0,123.19 100.35,223.4 223.67,223.4l2497.1 0c123.35,0 223.67,-100.21 223.67,-223.4l0 -997.64c0,-123.18 -100.33,-223.4 -223.67,-223.4l0.01 0 -0 0z",
    viewBox: "0 0 3150 1650",
    widthInches: 3.0,
    heightInches: 1.5,
    safeInsetPx: 6,
  },

  // House Outline 1.5×3 (3in x 1.5in)
  "house-1_5x3": {
    name: "House Outline 1.5×3",
    outlinePath: "M854.83 78.48c21.71,0 42.85,7.71 58,21.18l163.1 142.67 0.98 0.86 277.6 0 0 -108.82c0,-28.13 22.87,-51 51,-51l196.96 0c28.13,0 51,22.87 51,51l0 108.82 931.35 0c13.93,0 27.42,5.79 37,15.9l435.63 459.17c14.26,15.03 18.03,36.19 9.85,55.22 -8.18,19.04 -26.14,30.86 -46.85,30.86l-61.24 0 0 682.25c0,46.83 -38.1,84.93 -84.93,84.93l-2566.61 0c-46.83,0 -84.93,-38.1 -84.93,-84.93l0 -682.25 -93.15 0c-26.04,0 -41.74,-17.08 -47.74,-33.06 -6,-15.98 -5.43,-39.17 14.17,-56.32l703.61 -615.44c13.87,-13.57 33.47,-21.04 55.21,-21.04l0 0 -0.01 0zm0 -3.47c-21.37,0 -42.48,7.19 -57.64,22.03l-703.48 615.31c-37.86,33.11 -14.44,95.47 35.86,95.47l89.68 0 0 678.78c0,48.82 39.58,88.4 88.4,88.4l2566.6 0c48.83,0 88.4,-39.58 88.4,-88.4l0 -678.78 57.76 0c47.83,0 72.43,-57.25 39.52,-91.94l-435.63 -459.17c-10.28,-10.85 -24.57,-16.98 -39.52,-16.98l-927.87 0 0 -105.35c0,-30.08 -24.39,-54.47 -54.47,-54.47l-196.96 0c-30.08,0 -54.47,24.39 -54.47,54.47l0 105.35 -272.82 0 -163.1 -142.68c-16.36,-14.53 -38.46,-22.03 -60.28,-22.03l0 0 0.02 -0.01z",
    innerPath: "M3039.34 734.02l-435.13 -458.08c-5.33,-5.63 -12.83,-8.85 -20.58,-8.85l-952.82 0 0 -131.08c0,-15.64 -12.72,-28.36 -28.39,-28.36l-196.72 0c-15.65,0 -28.39,12.72 -28.39,28.36l0 131.08 -308.29 0 -170.4 -148.87c-11.06,-9.81 -26.69,-15.43 -42.94,-15.43 -15.57,0 -29.92,5.31 -39.32,14.5l-703.78 614.89c-13.75,12.02 -9.53,27.02 -7.9,31.32 1.63,4.32 8.35,18.39 26.6,18.39l115.58 0 0 703.14c0,34.29 27.93,62.21 62.28,62.21l2563.61 0c34.35,0 62.28,-27.89 62.28,-62.19l0 -703.14 83.71 0c17.36,0 24.36,-13.14 26.1,-17.17 1.74,-4.03 6.46,-18.14 -5.48,-30.71l0 0 -0.01 -0.01z",
    viewBox: "0 0 3150 1650",
    widthInches: 3.0,
    heightInches: 1.5,
    safeInsetPx: 0,
  },

  // Designer Badge 1×3 (3in x 1in) - Only Inner path available
  // Note: SVG file shows viewBox "0 0 3150 1650" but actual badge is 1in tall
  // The path is correct, but viewBox includes extra space - using 1150 height to match actual badge
  "designer-1x3": {
    name: "Designer Badge 1×3",
    innerPath: "M2300.17 366.15c64.2,0 110.96,11.35 138.98,33.75 21.23,16.97 31.74,40.25 31.24,69.18l0 0.87c0,0 -0.06,3.26 -0.06,3.26l3.96 -0.68 1.09 -0.19c16.67,-2.84 33.62,-5.01 50.39,-6.44 16.79,-1.43 33.85,-2.15 50.69,-2.15 122.44,0 238.47,36.53 326.69,102.85 88.35,66.43 139.6,155.63 144.32,251.08 0,1.21 0.06,2.5 0.13,3.81 0.05,1.13 0.12,2.26 0.12,3.49 0,1.23 -0.05,2.35 -0.12,3.52 -0.06,1.28 -0.13,2.57 -0.13,3.68 -4.72,95.56 -55.99,184.77 -144.33,251.2 -88.22,66.33 -204.24,102.85 -326.69,102.85 -16.84,0 -33.9,-0.72 -50.69,-2.15 -16.78,-1.43 -33.73,-3.59 -50.39,-6.44l-1.09 -0.19 -3.96 -0.68 0.05 3.26 0 0.87c0.52,28.93 -9.98,52.21 -31.22,69.18 -28.01,22.4 -74.77,33.75 -138.98,33.75 -153.09,0 -252.31,-19.15 -339.87,-36.05 -67.04,-12.94 -124.93,-24.11 -193.34,-24.11 -132.11,0 -179.22,41.83 -191.96,57.01 -12.74,-15.18 -59.86,-57.01 -191.96,-57.01 -68.43,0 -126.31,11.18 -193.38,24.11 -87.55,16.9 -186.77,36.04 -339.84,36.04 -64.19,0 -110.95,-11.35 -138.98,-33.75 -21.24,-16.98 -31.74,-40.25 -31.22,-69.18l0 -0.87c0,0 0.08,-3.26 0.08,-3.26l-3.97 0.68 -1.09 0.19c-16.65,2.84 -33.61,5.01 -50.39,6.44 -16.79,1.43 -33.85,2.15 -50.69,2.15 -122.44,0 -238.47,-36.53 -326.69,-102.85 -88.35,-66.43 -139.6,-155.63 -144.33,-251.09 0,-1.15 -0.05,-2.37 -0.13,-3.79 -0.05,-1.13 -0.12,-2.28 -0.12,-3.52 0,-1.24 0.05,-2.37 0.12,-3.68 0.05,-1.24 0.12,-2.48 0.12,-3.52 4.74,-95.56 55.99,-184.77 144.33,-251.2 88.22,-66.33 204.24,-102.85 326.69,-102.85 16.84,0 33.89,0.72 50.69,2.15 16.78,1.43 33.73,3.59 50.41,6.44l1.09 0.19 3.97 0.68 -0.06 -3.27 0 -0.87c-0.53,-28.93 9.98,-52.21 31.21,-69.18 28.01,-22.4 74.77,-33.75 138.98,-33.75 153.07,0 252.3,19.15 339.85,36.04 67.04,12.94 124.94,24.11 193.37,24.11 132.1,0 179.22,-41.83 191.96,-57.01 12.74,15.18 59.86,57.01 191.96,57.01 68.41,0 126.31,-11.18 193.38,-24.11 87.55,-16.9 186.76,-36.04 339.84,-36.04l0 0.03 -0.03 0.02 0 0 0 -0zm0 -2.6c-153.47,0 -253.81,19.37 -340.6,36.11 -66.22,12.78 -124.57,24.04 -192.62,24.04 -144.61,0 -186.02,-50.79 -191.96,-59.33 -5.94,8.54 -47.35,59.33 -191.96,59.33 -68.04,0 -126.38,-11.26 -192.61,-24.04 -86.8,-16.75 -187.14,-36.11 -340.6,-36.11 -72.26,0 -115.85,14.2 -141.25,34.5 -25.36,20.27 -32.62,46.67 -32.18,71.06l0 0.87c0,0 -1.07,-0.19 -1.07,-0.19 -16.62,-2.84 -33.55,-5.02 -50.73,-6.48 -16.75,-1.43 -33.77,-2.17 -51.03,-2.17 -127.7,0 -243.61,39.43 -328.9,103.56 -85.64,64.4 -140.44,153.7 -145.36,252.99 0,1.17 -0.06,2.43 -0.12,3.69 -0.05,1.18 -0.12,2.34 -0.12,3.61 0,1.27 0.05,2.45 0.12,3.61 0.06,1.26 0.12,2.52 0.12,3.69 4.92,99.3 59.71,188.6 145.36,252.99 85.29,64.13 201.2,103.56 328.9,103.56 17.26,0 34.28,-0.74 51.03,-2.17 17.18,-1.46 34.11,-3.63 50.73,-6.48l1.09 -0.19 0 0.87c-0.45,24.4 6.81,50.79 32.17,71.06 25.4,20.3 69,34.51 141.25,34.51 153.46,0 253.82,-19.37 340.6,-36.11 66.22,-12.78 124.57,-24.04 192.61,-24.04 144.61,0 186.02,50.79 191.96,59.33 5.94,-8.54 47.35,-59.33 191.96,-59.33 68.04,0 126.39,11.26 192.62,24.04 86.8,16.75 187.14,36.11 340.6,36.11 72.26,0 115.85,-14.21 141.25,-34.51 25.36,-20.27 32.62,-46.67 32.18,-71.06l0 -0.87c0,0 1.07,0.19 1.07,0.19 16.62,2.84 33.54,5.02 50.73,6.48 16.75,1.43 33.77,2.17 51.03,2.17 127.7,0 243.61,-39.43 328.9,-103.56 85.64,-64.4 140.44,-153.7 145.36,-252.99 0,-1.18 0.06,-2.44 0.13,-3.69 0.06,-1.18 0.12,-2.34 0.12,-3.61 0,-1.27 -0.06,-2.44 -0.12,-3.61 -0.06,-1.25 -0.13,-2.51 -0.13,-3.69 -4.92,-99.3 -59.71,-188.59 -145.36,-252.99 -85.29,-64.13 -201.2,-103.56 -328.9,-103.56 -17.26,0 -34.28,0.74 -51.03,2.17 -17.19,1.46 -34.11,3.63 -50.73,6.48l-1.09 0.19 0 -0.87c0.44,-24.4 -6.81,-50.79 -32.17,-71.06 -25.4,-20.3 -69,-34.5 -141.25,-34.5l0 0z",
    viewBox: "0 0 3150 1150",
    widthInches: 3.0,
    heightInches: 1.0,
    safeInsetPx: 0,
  },

  // Fancy Badge 1.5×3 (3in x 1.5in) - Only Inner path available
  "fancy-1_5x3": {
    name: "Fancy Badge 1.5×3",
    innerPath: "M1606.62 262.5l0 2.6c68,0 142.37,5.18 227.32,15.8l863.06 126.27 0.39 0 0 835.66 -0.77 0c0,0 -862.63,126.24 -862.63,126.24 -85.01,10.63 -159.39,15.81 -227.37,15.81 -10.65,0 -21.26,-0.13 -31.69,-0.4 -10.28,0.26 -20.91,0.4 -31.55,0.4 -67.99,0 -142.37,-5.18 -227.32,-15.8l-863.07 -126.26 -0.4 0 0 -835.67 0.77 0c0,0 862.63,-126.24 862.63,-126.24 85.01,-10.63 159.39,-15.81 227.37,-15.81 10.65,0 21.26,0.13 31.69,0.4 10.28,-0.26 20.91,-0.4 31.55,-0.4l0 -2.6 0.01 0 0.01 0zm0 0c-10.66,0 -21.19,0.13 -31.63,0.4 -10.43,-0.26 -20.98,-0.4 -31.63,-0.4 -71.56,0 -147.93,5.84 -227.7,15.83l-862.68 126.24 -3 0 0 840.84 3 0 862.68 126.24c79.77,9.98 156.15,15.83 227.7,15.83 10.66,0 21.19,-0.13 31.63,-0.4 10.43,0.26 20.98,0.4 31.63,0.4 71.56,0 147.93,-5.84 227.7,-15.83l862.68 -126.24 3 0 0 -840.84 -3 0 -862.68 -126.24c-79.77,-9.98 -156.15,-15.83 -227.7,-15.83l0 0z",
    viewBox: "0 0 3150 1650",
    widthInches: 3.0,
    heightInches: 1.5,
    safeInsetPx: 0,
  },

  // Oval 1.5×3 (3in x 1.5in) - Only Inner path available
  "oval-1_5x3": {
    name: "Oval 1.5×3",
    innerPath: "M1575 265.11c618.9,0 1122.4,251.17 1122.4,559.9 0,308.73 -503.5,559.9 -1122.4,559.9 -618.9,0 -1122.4,-251.17 -1122.4,-559.9 0,-308.73 503.5,-559.9 1122.4,-559.9l0 0zm0 -2.6c-621.32,0 -1125,251.84 -1125,562.5 0,310.66 503.68,562.5 1125,562.5 621.32,0 1125,-251.84 1125,-562.5 0,-310.66 -503.68,-562.5 -1125,-562.5l0 0z",
    viewBox: "0 0 3150 1650",
    widthInches: 3.0,
    heightInches: 1.5,
    safeInsetPx: 0,
  },

  // Square Corner 1×3 (3in x 1in)
  "square-1x3": {
    name: "Square Corner 1×3",
    innerPath: "M3044.32 104.61l0 940.79 -2938.64 0 0 -940.79 2938.64 0m3.41 -3.29l-2945.46 0 0 947.37 2945.46 0 0 -947.37 0 0z",
    viewBox: "0 0 3150 1150",
    widthInches: 3.0,
    heightInches: 1.0,
    safeInsetPx: 6,
  },

  // Square Corner 1.5×3 (3in x 1.5in)
  "square-1_5x3": {
    name: "Square Corner 1.5×3",
    innerPath: "M3044.32 105.13l0 1439.73 -2938.64 0 0 -1439.73 2938.64 0 0 0zm3.41 -3.35l-2945.46 0 0 1446.43 2945.46 0 0 -1446.43 0 0z",
    viewBox: "0 0 3150 1650",
    widthInches: 3.0,
    heightInches: 1.5,
    safeInsetPx: 6,
  },
};

/**
 * Renders a badge SVG shape from a shape definition.
 * 
 * @param shapeId - The badge shape identifier (e.g., "rect-1x3")
 * @param options - Rendering options
 * @returns Complete SVG string for the badge shape
 */
export function renderBadgeSvg(
  shapeId: string,
  options?: {
    outlineColor?: string;
    fillColor?: string;
    showInner?: boolean;
    showOutline?: boolean;
  }
): string {
  const shape = BADGE_SHAPE_PATHS[shapeId];
  if (!shape) {
    throw new Error(`Shape "${shapeId}" not found`);
  }

  const { outlinePath, innerPath, viewBox, widthInches, heightInches } = shape;
  const outlineColor = options?.outlineColor ?? "#222";
  const fillColor = options?.fillColor ?? "white";
  const showInner = options?.showInner ?? true;
  const showOutline = options?.showOutline ?? true;

  // Use outline path if available, otherwise fall back to inner path
  const effectiveOutlinePath = outlinePath || innerPath;

  // Convert inches to pixels at 96 DPI for width/height attributes
  const widthPx = Math.round(widthInches * 96);
  const heightPx = Math.round(heightInches * 96);

  return `
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${widthInches}in" 
     height="${heightInches}in" 
     viewBox="${viewBox}">
  ${showOutline ? `<path id="Outline" d="${effectiveOutlinePath}" stroke="${outlineColor}" stroke-width="15" fill="${fillColor}"/>` : ''}
  ${showInner ? `<path id="Inner" d="${innerPath}" stroke="#aaa" stroke-width="10" fill="none"/>` : ''}
</svg>`.trim();
}

/**
 * Gets the inner path for a badge shape (for clipping).
 * 
 * @param shapeId - The badge shape identifier
 * @returns The inner path string, or null if not found
 */
export function getInnerPath(shapeId: string): string | null {
  const shape = BADGE_SHAPE_PATHS[shapeId];
  return shape?.innerPath || null;
}

  /**
   * Gets the outline path for a badge shape (for display).
   * For 2nd gen templates (designer, fancy, oval, square), the inner path IS the edge,
   * so we return null to indicate no separate outline should be shown.
   *
   * @param shapeId - The badge shape identifier
   * @returns The outline path string, or null if not found or if inner path is the edge
   */
  export function getOutlinePath(shapeId: string): string | null {
    const shape = BADGE_SHAPE_PATHS[shapeId];
    // If there's an explicit outlinePath, use it (1st gen templates)
    if (shape?.outlinePath) {
      return shape.outlinePath;
    }
    // For 2nd gen templates, inner path IS the edge, so return null
    // This tells the rendering system not to show a separate outline
    return null;
  }

/**
 * Gets the viewBox for a badge shape.
 * 
 * @param shapeId - The badge shape identifier
 * @returns The viewBox string, or null if not found
 */
export function getViewBox(shapeId: string): string | null {
  const shape = BADGE_SHAPE_PATHS[shapeId];
  return shape?.viewBox || null;
}

/**
 * Gets the dimensions for a badge shape.
 * 
 * @param shapeId - The badge shape identifier
 * @returns Object with widthInches and heightInches, or null if not found
 */
export function getDimensions(shapeId: string): { widthInches: number; heightInches: number } | null {
  const shape = BADGE_SHAPE_PATHS[shapeId];
  if (!shape) return null;
  return {
    widthInches: shape.widthInches,
    heightInches: shape.heightInches,
  };
}

