/**
 * Gavels Fast catalog — matched to product photos in app/temp/gavelImages.
 *
 * Same lathe-turned head on every SKU. Woods: American walnut, oak, ebony.
 * Ebony ships with a silver band; walnut/oak with gold.
 * Handle length varies (short / standard / long).
 *
 * Physical defaults estimated from side-photo aspect (~3.1× head diameter)
 * and typical 2.1" head. Update inches when manufacturing confirms.
 */

export const GAVEL_STYLE_IDS = ["walnut", "oak", "ebony"] as const;
export type GavelStyleId = (typeof GAVEL_STYLE_IDS)[number];

export const GAVEL_BAND_FINISH_IDS = ["gold", "silver"] as const;
export type GavelBandFinishId = (typeof GAVEL_BAND_FINISH_IDS)[number];

export const GAVEL_HANDLE_LENGTH_IDS = ["short", "standard", "long"] as const;
export type GavelHandleLengthId = (typeof GAVEL_HANDLE_LENGTH_IDS)[number];

export const GAVEL_TEXT_SIZE_PRESETS = ["small", "medium", "large"] as const;
export type GavelTextSizePreset = (typeof GAVEL_TEXT_SIZE_PRESETS)[number];

/** Head diameter (inches). Circumference = π × diameter. */
export const GAVEL_HEAD_DIAMETER_IN = 1.62;

/** Head length along the striking axis (inches). */
export const GAVEL_HEAD_LENGTH_IN = 2.36;

/** Engraved band height (inches) — ~36% of head length from photos. */
export const GAVEL_BAND_HEIGHT_IN = 0.84;

export const GAVEL_BAND_CIRCUMFERENCE_IN =
  Math.PI * GAVEL_HEAD_DIAMETER_IN;

/** Handle shaft length from collar to tip (inches), not including head. */
export const GAVEL_HANDLE_LENGTH_IN: Record<GavelHandleLengthId, number> = {
  short: 4.2,
  standard: 5.6,
  long: 7.2,
};

/** Canvas texture resolution for the unwrapped band. */
export const GAVEL_BAND_TEXTURE_WIDTH_PX = 2048;
export const GAVEL_BAND_TEXTURE_HEIGHT_PX = 256;

export const GAVEL_MAX_LINES = 3;

export const GAVEL_DEFAULT_FONT = "Georgia";

export const GAVEL_DEFAULT_TEXT_COLOR = "#1a1a1a";

export const GAVEL_BAND_GOLD_HEX = "#c9a24a";
export const GAVEL_BAND_GOLD_DARK_HEX = "#a07d28";
export const GAVEL_BAND_SILVER_HEX = "#c5c8cc";

export type GavelStyleDef = {
  id: GavelStyleId;
  label: string;
  description: string;
  bodyColor: string;
  roughness: number;
  metalness: number;
  grainTint: string;
  useWoodGrain: boolean;
  /** Product photos: ebony uses silver; walnut/oak use gold. */
  bandFinish: GavelBandFinishId;
  thumbSrc: string;
};

export const GAVEL_STYLES: readonly GavelStyleDef[] = [
  {
    id: "walnut",
    label: "American Walnut",
    description: "Rich warm walnut with a brushed gold band.",
    bodyColor: "#6b4634",
    roughness: 0.44,
    metalness: 0.04,
    grainTint: "#2e1c12",
    useWoodGrain: true,
    bandFinish: "gold",
    thumbSrc: "/images/gavel/thumb-walnut.jpg",
  },
  {
    id: "oak",
    label: "Oak",
    description: "Honey oak grain with a brushed gold band.",
    bodyColor: "#d0ad78",
    roughness: 0.4,
    metalness: 0.04,
    grainTint: "#8a6238",
    useWoodGrain: true,
    bandFinish: "gold",
    thumbSrc: "/images/gavel/thumb-oak.jpg",
  },
  {
    id: "ebony",
    label: "Ebony",
    description: "Matte ebony with a brushed silver band.",
    bodyColor: "#242226",
    roughness: 0.55,
    metalness: 0.02,
    grainTint: "#0a0a0c",
    useWoodGrain: false,
    bandFinish: "silver",
    thumbSrc: "/images/gavel/thumb-ebony.jpg",
  },
] as const;

export const GAVEL_BAND_FINISHES: readonly {
  id: GavelBandFinishId;
  label: string;
  color: string;
}[] = [
  { id: "gold", label: "Gold", color: GAVEL_BAND_GOLD_HEX },
  { id: "silver", label: "Silver", color: GAVEL_BAND_SILVER_HEX },
];

export const GAVEL_HANDLE_LENGTHS: readonly {
  id: GavelHandleLengthId;
  label: string;
  hint: string;
}[] = [
  { id: "short", label: "Short", hint: "Compact" },
  { id: "standard", label: "Standard", hint: "Most common" },
  { id: "long", label: "Long", hint: "Presentation" },
];

export const GAVEL_FONT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "Georgia", label: "Georgia" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Noto Serif", label: "Noto Serif" },
  { value: "Roboto Serif", label: "Roboto Serif" },
  { value: "Roboto Slab", label: "Roboto Slab" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Montserrat", label: "Montserrat" },
];

export const GAVEL_TEXTURE_FONT_PX: Record<GavelTextSizePreset, number> = {
  small: 42,
  medium: 56,
  large: 78,
};

export const GAVEL_MAX_CHARS_PER_LINE: Record<GavelTextSizePreset, number> = {
  small: 42,
  medium: 32,
  large: 22,
};

const LEGACY_STYLE_ALIASES: Record<string, GavelStyleId> = {
  mahogany: "walnut",
  metal: "ebony",
};

export function getGavelStyle(id: string | null | undefined): GavelStyleDef {
  const mapped = id ? LEGACY_STYLE_ALIASES[id] ?? id : "walnut";
  return GAVEL_STYLES.find((s) => s.id === mapped) ?? GAVEL_STYLES[0];
}

export function getGavelBandFinish(
  id: string | null | undefined,
): (typeof GAVEL_BAND_FINISHES)[number] {
  return GAVEL_BAND_FINISHES.find((f) => f.id === id) ?? GAVEL_BAND_FINISHES[0];
}

export function getGavelHandleLength(
  id: string | null | undefined,
): (typeof GAVEL_HANDLE_LENGTHS)[number] {
  return (
    GAVEL_HANDLE_LENGTHS.find((h) => h.id === id) ?? GAVEL_HANDLE_LENGTHS[1]
  );
}

export function isGavelStyleId(value: string): value is GavelStyleId {
  return (GAVEL_STYLE_IDS as readonly string[]).includes(value);
}

export function clampGavelLineText(
  text: string,
  preset: GavelTextSizePreset,
): string {
  const max = GAVEL_MAX_CHARS_PER_LINE[preset];
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function formatGavelOrderFinish(
  styleId: string | null | undefined,
  bandFinishId: string | null | undefined = undefined,
  handleId: string | null | undefined = "standard",
): string {
  const style = getGavelStyle(styleId);
  const band = getGavelBandFinish(bandFinishId ?? style.bandFinish);
  const handle = getGavelHandleLength(handleId);
  return `${style.label} · ${band.label} band · ${handle.label} handle`;
}
