export type PenBandMode = "text" | "logo";

export type PenFontId =
  | "Montserrat"
  | "Georgia"
  | "Playfair Display"
  | "Roboto Slab";

export interface PenSurfaceSpec {
  widthIn: number;
  heightIn: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  safeInset: number;
}

/**
 * Initial production estimates. Keep calibration in one place so vendor
 * measurements can replace these values without changing saved designs or UI.
 */
export const PEN_SURFACES = {
  caseBand: {
    widthIn: 2.1,
    heightIn: 0.72,
    viewBoxWidth: 1050,
    viewBoxHeight: 360,
    safeInset: 34,
  },
  cap: {
    widthIn: 1.65,
    heightIn: 0.38,
    viewBoxWidth: 990,
    viewBoxHeight: 228,
    safeInset: 28,
  },
} satisfies Record<string, PenSurfaceSpec>;

export const PEN_FONTS: readonly {
  id: PenFontId;
  label: string;
  sample: string;
}[] = [
  { id: "Montserrat", label: "Modern", sample: "Montserrat, Arial, sans-serif" },
  { id: "Georgia", label: "Classic", sample: "Georgia, serif" },
  {
    id: "Playfair Display",
    label: "Elegant",
    sample: "'Playfair Display', Georgia, serif",
  },
  {
    id: "Roboto Slab",
    label: "Slab",
    sample: "'Roboto Slab', Georgia, serif",
  },
];

export const PEN_LIMITS = {
  caseBandText: 42,
  capText: 28,
  quantityMin: 1,
  quantityMax: 999,
} as const;

export const PEN_DEFAULT_PRICE = 29.99;
export const PEN_ENGRAVING_COLOR = "#f3f4f5";
export const PEN_METAL_COLOR = "#d8d8d5";
