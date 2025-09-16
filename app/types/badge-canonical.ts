// Canonical badge types with explicit units
// This is the single source of truth for badge data structures

export type Inches = number;
export type Px = number;

// Template definition - compiled at build time
export type Template = {
  id: string;
  name: string;
  widthIn: Inches;   // e.g., 3.0 inches
  heightIn: Inches;  // e.g., 1.0 inches
  safeInsetPx: Px;   // UI helper only
  // Geometry already normalized to [0..Wpx, 0..Hpx]
  innerPathSvg: string;      // <path .../> or <ellipse/rect .../> (no stroke/fill)
  outlinePathSvg?: string;   // optional
};

// Image layer with explicit positioning
export type ImageLayer = {
  src: string;           // dataURL or URL
  // normalized placement in design space:
  xPx: Px; 
  yPx: Px; 
  wPx: Px; 
  hPx: Px; 
  rotationDeg?: number;
  fit: "cover" | "contain";
};

// Text line with explicit positioning
export type TextLine = {
  text: string;
  xPx: Px; 
  yPx: Px;
  fontFamily: string;
  fontSizePx: Px;
  color: string;
  align: "left" | "center" | "right";
  bold?: boolean; 
  italic?: boolean;
};

// Badge definition - the canonical data model
export type Badge = {
  id: string;
  templateId: string;
  backgroundColor: string;
  backgroundImage?: ImageLayer;
  logo?: ImageLayer;
  lines: TextLine[];
};

// Render options
export type RenderOpts = { 
  showOutline?: boolean; 
  debug?: boolean 
};
