/**
 * Gavels Fast catalog — matched to product photos in app/temp/gavelImages.
 *
 * Same lathe-turned head on every SKU. Woods: American walnut, oak, ebony,
 * and stained purple. Ebony ships with a silver band; the others with gold.
 * Handle length varies (short / standard / long).
 *
 * Physical defaults estimated from side-photo aspect (~3.1× head diameter)
 * and typical 2.1" head. Update inches when manufacturing confirms.
 */

export const GAVEL_STYLE_IDS = ["walnut", "oak", "ebony", "purple"] as const;
export type GavelStyleId = (typeof GAVEL_STYLE_IDS)[number];

export const GAVEL_BAND_FINISH_IDS = ["gold", "silver"] as const;
export type GavelBandFinishId = (typeof GAVEL_BAND_FINISH_IDS)[number];

export const GAVEL_HANDLE_LENGTH_IDS = ["short", "standard", "long"] as const;
export type GavelHandleLengthId = (typeof GAVEL_HANDLE_LENGTH_IDS)[number];

export const GAVEL_TEXT_SIZE_PRESETS = ["small", "medium", "large"] as const;
export type GavelTextSizePreset = (typeof GAVEL_TEXT_SIZE_PRESETS)[number];

export const GAVEL_PRODUCT_TYPES = ["gavel", "stand"] as const;
export type GavelProductType = (typeof GAVEL_PRODUCT_TYPES)[number];

export const GAVEL_SOUND_BLOCK_IDS = ["none", "plain", "engraved"] as const;
export type GavelSoundBlockId = (typeof GAVEL_SOUND_BLOCK_IDS)[number];

export const GAVEL_STAND_FINISH_IDS = ["gold", "silver", "white"] as const;
export type GavelStandFinishId = (typeof GAVEL_STAND_FINISH_IDS)[number];

export const GAVEL_PRODUCTION_METHOD_IDS = ["engrave", "uvprint"] as const;
export type GavelProductionMethodId =
  (typeof GAVEL_PRODUCTION_METHOD_IDS)[number];

/**
 * Head and band dimensions come from the manufacturer's dimensioned drawing:
 * 3" head length × 2" diameter, 10.25" overall.
 */

/** Head diameter (inches). Circumference = π × diameter. */
export const GAVEL_HEAD_DIAMETER_IN = 2.0;

/** Head length along the striking axis (inches). */
export const GAVEL_HEAD_LENGTH_IN = 3.0;

/** Y of the striking face the gavel rests on, for shadows and framing. */
export function gavelGroundY(): number {
  return -GAVEL_HEAD_LENGTH_IN / 2;
}

/** Engraved band height (inches) — 30% of head length on the drawing. */
export const GAVEL_BAND_HEIGHT_IN = 0.908;

/**
 * The band is recessed below the wood beads — measured at 94% of the head
 * diameter off the close-up photo. Engraving wraps the band, not the beads,
 * so artwork width comes from this diameter.
 */
export const GAVEL_BAND_DIAMETER_IN = GAVEL_HEAD_DIAMETER_IN * 0.94;

export const GAVEL_BAND_CIRCUMFERENCE_IN =
  Math.PI * GAVEL_BAND_DIAMETER_IN;

/**
 * Default framing for the 3D preview. The head (and band) sit at the origin and
 * the handle runs out along −Z, so the camera sits on the +Z side to face the
 * engraved side of the band, offset enough that the handle still reads.
 */
export const GAVEL_VIEW_CAMERA_POSITION: readonly [number, number, number] = [
  6.54, 3.92, 12.3,
];

export const GAVEL_VIEW_TARGET: readonly [number, number, number] = [
  0, 0.07, -2.32,
];

/**
 * Handle shaft length from collar to tip (inches), not including head.
 * `standard` is measured off the drawing (8.36" exposed → 10.25" overall);
 * short and long keep the previous spread around it.
 */
export const GAVEL_HANDLE_LENGTH_IN: Record<GavelHandleLengthId, number> = {
  short: 6.3,
  standard: 8.36,
  long: 10.75,
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
  /**
   * For scanned woods this multiplies the roughness map, whose satin values sit
   * lower than a finished gavel reads under studio light. For procedural styles
   * it is the flat roughness.
   *
   * Note there is deliberately no per-style envMapIntensity: three.js overwrites
   * it with scene.environmentIntensity for any material that has no envMap of
   * its own, so reflection strength is set once on the Environment instead.
   */
  roughness: number;
  metalness: number;
  grainTint: string;
  useWoodGrain: boolean;
  /**
   * Folder under /textures/gavel holding the scanned PBR maps, or undefined to
   * fall back to the procedural canvas grain.
   */
  textureSet?: string;
  /** Product photos: ebony uses silver; walnut/oak/purple use gold. */
  bandFinish: GavelBandFinishId;
  thumbSrc: string;
};

export const GAVEL_STYLES: readonly GavelStyleDef[] = [
  {
    id: "walnut",
    label: "American Walnut",
    description: "Rich warm walnut with a brushed gold band.",
    bodyColor: "#765040",
    roughness: 1.8,
    metalness: 0,
    grainTint: "#38241c",
    useWoodGrain: true,
    textureSet: "walnut",
    bandFinish: "gold",
    thumbSrc: "/images/gavel/thumb-walnut.jpg",
  },
  {
    id: "oak",
    label: "Oak",
    description: "Honey oak grain with a brushed gold band.",
    bodyColor: "#c4894e",
    roughness: 1.2,
    metalness: 0,
    grainTint: "#8a6238",
    useWoodGrain: true,
    textureSet: "oak",
    bandFinish: "gold",
    thumbSrc: "/images/gavel/thumb-oak.jpg",
  },
  {
    id: "ebony",
    label: "Ebony",
    description: "Matte ebony with a brushed silver band.",
    bodyColor: "#1a1412",
    roughness: 2.1,
    metalness: 0,
    grainTint: "#0a0a0c",
    useWoodGrain: true,
    textureSet: "ebony",
    bandFinish: "silver",
    thumbSrc: "/images/gavel/thumb-ebony.jpg",
  },
  {
    id: "purple",
    label: "Purple",
    description: "Stained plum walnut with a brushed gold band.",
    bodyColor: "#5a3848",
    roughness: 1.8,
    metalness: 0,
    grainTint: "#3a2330",
    useWoodGrain: true,
    textureSet: "purple",
    bandFinish: "gold",
    thumbSrc: "/images/gavel/thumb-purple.jpg",
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

export const GAVEL_PRODUCT_TYPE_OPTIONS: readonly {
  id: GavelProductType;
  label: string;
  description: string;
  photoSrc: string;
}[] = [
  {
    id: "gavel",
    label: "Gavel",
    description: "Band engraving, with or without sound block",
    photoSrc: "/images/gavel/product-gavel-trim.png",
  },
  {
    id: "stand",
    label: "Gavel stand",
    description: "Sold separately, plate engraved or UV printed",
    photoSrc: "/images/gavel/product-stand-trim.png",
  },
];

export const GAVEL_SOUND_BLOCK_OPTIONS: readonly {
  id: GavelSoundBlockId;
  label: string;
}[] = [
  { id: "none", label: "Gavel only" },
  { id: "plain", label: "+ Sound block, plain" },
  { id: "engraved", label: "+ Sound block, engraved" },
];

export const GAVEL_STAND_FINISH_OPTIONS: readonly {
  id: GavelStandFinishId;
  label: string;
  plateHex: string;
  /** White plates can be engraved or UV printed in full color. */
  allowsUvPrint: boolean;
  note: string;
}[] = [
  {
    id: "gold",
    label: "Gold",
    plateHex: GAVEL_BAND_GOLD_HEX,
    allowsUvPrint: false,
    note: "Gold and silver plates are engraved — text or logo, single color.",
  },
  {
    id: "silver",
    label: "Silver",
    plateHex: GAVEL_BAND_SILVER_HEX,
    allowsUvPrint: false,
    note: "Gold and silver plates are engraved — text or logo, single color.",
  },
  {
    id: "white",
    label: "White",
    plateHex: "#ffffff",
    allowsUvPrint: true,
    note: "White plates can be engraved or UV printed in full color — choose in the next step.",
  },
];

export const GAVEL_PRODUCTION_METHOD_OPTIONS: readonly {
  id: GavelProductionMethodId;
  label: string;
}[] = [
  { id: "engrave", label: "Engrave" },
  { id: "uvprint", label: "UV print — full color" },
];

/** UV-print text colors (single-color engraving always uses the default). */
export const GAVEL_UV_TEXT_COLORS: readonly string[] = [
  "#1c2430",
  "#b8860b",
  "#a32d2d",
  "#185fa5",
  "#0f6e56",
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

export function getGavelStandFinish(
  id: string | null | undefined,
): (typeof GAVEL_STAND_FINISH_OPTIONS)[number] {
  return (
    GAVEL_STAND_FINISH_OPTIONS.find((f) => f.id === id) ??
    GAVEL_STAND_FINISH_OPTIONS[0]
  );
}

export function getGavelSoundBlock(
  id: string | null | undefined,
): (typeof GAVEL_SOUND_BLOCK_OPTIONS)[number] {
  return (
    GAVEL_SOUND_BLOCK_OPTIONS.find((o) => o.id === id) ??
    GAVEL_SOUND_BLOCK_OPTIONS[0]
  );
}

export function getGavelProductionMethod(
  id: string | null | undefined,
): (typeof GAVEL_PRODUCTION_METHOD_OPTIONS)[number] {
  return (
    GAVEL_PRODUCTION_METHOD_OPTIONS.find((o) => o.id === id) ??
    GAVEL_PRODUCTION_METHOD_OPTIONS[0]
  );
}

/**
 * PLACEHOLDER PoC pricing only — replace with Shopify variant pricing before
 * launch. Used solely when the embed does not pass a `price` query param.
 */
export const GAVEL_SAMPLE_PRICING = {
  gavel: { base: 15.99, mid: 14.39, high: 12.79 },
  stand: { base: 22.99, mid: 19.99, high: 17.49 },
  soundBlockAdd: 2,
  suedeBagAdd: 3.99,
  /** Quantity at which the mid / high tier starts. */
  midQty: 10,
  highQty: 21,
} as const;

export type GavelPriceQuote = {
  unitPrice: number;
  total: number;
  /** True when tiers come from the sample table, not the store. */
  isSample: boolean;
  tierNote: string;
};

/**
 * Quantity pricing for the designer's estimate panel.
 * With a store price we show it flat (no invented volume discounts);
 * without one we fall back to the sample tier table for demos.
 */
export function quoteGavelPrice(input: {
  productType: GavelProductType;
  soundBlock: GavelSoundBlockId;
  suedeBag: boolean;
  quantity: number;
  storeUnitPrice?: number | null;
}): GavelPriceQuote {
  const qty = Math.max(1, Math.round(input.quantity));
  const addOns =
    (input.soundBlock !== "none" ? GAVEL_SAMPLE_PRICING.soundBlockAdd : 0) +
    (input.suedeBag ? GAVEL_SAMPLE_PRICING.suedeBagAdd : 0);

  const store = input.storeUnitPrice;
  if (typeof store === "number" && Number.isFinite(store) && store > 0) {
    const unitPrice = store + addOns;
    return {
      unitPrice,
      total: unitPrice * qty,
      isSample: false,
      tierNote: "Store pricing — add-ons estimated.",
    };
  }

  const table = GAVEL_SAMPLE_PRICING[input.productType];
  const tier =
    qty < GAVEL_SAMPLE_PRICING.midQty
      ? table.base
      : qty < GAVEL_SAMPLE_PRICING.highQty
        ? table.mid
        : table.high;
  const unitPrice = tier + addOns;
  return {
    unitPrice,
    total: unitPrice * qty,
    isSample: true,
    tierNote: "Sample pricing for demo — not final.",
  };
}

export function formatGavelMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** One-line summary of the add-on choices, for proofs and order slips. */
export function formatGavelOptionSummary(input: {
  productType: GavelProductType;
  soundBlock: GavelSoundBlockId;
  suedeBag: boolean;
  standFinish?: GavelStandFinishId;
  productionMethod?: GavelProductionMethodId;
}): string {
  if (input.productType === "stand") {
    const finish = getGavelStandFinish(input.standFinish);
    const method = getGavelProductionMethod(input.productionMethod);
    return `Gavel stand · ${finish.label} plate · ${method.label}`;
  }
  const parts = [getGavelSoundBlock(input.soundBlock).label];
  parts.push(input.suedeBag ? "Suede bag" : "No bag");
  return parts.join(" · ");
}
