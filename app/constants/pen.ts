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
 * Production estimates, scaled off the product photography: the case band's
 * engraved face is close to square and the cap's is a shallow strip. Keep
 * calibration in one place so vendor measurements can replace these values
 * without changing saved designs or UI.
 */
export const PEN_SURFACES = {
  caseBand: {
    widthIn: 1.7,
    heightIn: 1.7,
    viewBoxWidth: 1020,
    viewBoxHeight: 1020,
    safeInset: 90,
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

export type PenPoint = readonly [number, number];

export interface PenPreviewPhoto {
  src: string;
  alt: string;
  /** Intrinsic size of the photo, which the quad below is measured against. */
  width: number;
  height: number;
  /**
   * The engraving plane, in photo pixels, as [origin, alongText, opposite,
   * acrossText]. Artwork is mapped onto it with an affine transform so it sits
   * on the product at the same angle as the surface.
   */
  quad: readonly [PenPoint, PenPoint, PenPoint, PenPoint];
  /** Share of the plane left clear around the artwork, per side. */
  inset: number;
  /** Cap on engraved text size, as a share of the plane's cross-text extent. */
  maxTextScale: number;
  maxLines: number;
  color: string;
}

/**
 * Measured off the retouched product photos in `public/images/pen`. Re-measure
 * these if the photos are ever replaced.
 */
export const PEN_PREVIEW_PHOTOS = {
  caseBand: {
    src: "/images/pen/case-band.jpg",
    alt: "Black presentation case with a silver engraving band on the lid",
    width: 679,
    height: 679,
    quad: [
      [288, 233],
      [377, 196],
      [445, 268],
      [353, 307],
    ],
    inset: 0.12,
    maxTextScale: 0.17,
    maxLines: 3,
    color: "#5c6166",
  },
  cap: {
    src: "/images/pen/pen-cap.jpg",
    alt: "Blue pen cap with a clear engraving area on the barrel",
    width: 400,
    height: 168,
    quad: [
      [126, 75],
      [332, 71],
      [332, 117],
      [126, 121],
    ],
    inset: 0.08,
    maxTextScale: 0.6,
    maxLines: 1,
    color: "#e9eef2",
  },
} satisfies Record<string, PenPreviewPhoto>;

export const PEN_LIMITS = {
  caseBandText: 42,
  capText: 28,
  quantityMin: 1,
  quantityMax: 999,
} as const;

export const PEN_DEFAULT_PRICE = 29.99;
export const PEN_ENGRAVING_COLOR = "#f3f4f5";
export const PEN_METAL_COLOR = "#d8d8d5";
