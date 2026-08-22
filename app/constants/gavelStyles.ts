/**
 * Gavels Fast catalog — matched to the product photos in
 * "app/temp/Gavels Fast - Core Products/Gavels & Sound Blocks".
 *
 * Same lathe-turned head on every SKU, in the three woods we offer: American
 * walnut, hardwood (cherry-finished rubberwood), and ebony. Band metal (gold
 * or silver) is chosen separately. Handle length is always the standard size.
 *
 * Physical defaults estimated from side-photo aspect (~3.1× head diameter)
 * and typical 2.1" head. Update inches when manufacturing confirms.
 */

export const GAVEL_STYLE_IDS = ["walnut", "rubberwood", "ebony"] as const;
export type GavelStyleId = (typeof GAVEL_STYLE_IDS)[number];

export const GAVEL_BAND_FINISH_IDS = ["gold", "silver"] as const;
export type GavelBandFinishId = (typeof GAVEL_BAND_FINISH_IDS)[number];

export const GAVEL_TEXT_SIZE_PRESETS = ["small", "medium", "large"] as const;
export type GavelTextSizePreset = (typeof GAVEL_TEXT_SIZE_PRESETS)[number];

export const GAVEL_PRODUCT_TYPES = ["gavel", "stand"] as const;
export type GavelProductType = (typeof GAVEL_PRODUCT_TYPES)[number];

export const GAVEL_SOUND_BLOCK_IDS = ["none", "plain", "engraved"] as const;
export type GavelSoundBlockId = (typeof GAVEL_SOUND_BLOCK_IDS)[number];

export const GAVEL_STAND_FINISH_IDS = ["gold", "silver"] as const;
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

/** Framing for the personalized sound-block (high three-quarter so the top reads). */
export const SOUND_BLOCK_VIEW_CAMERA_POSITION: readonly [
  number,
  number,
  number,
] = [4.6, 8.8, 7.0];

export const SOUND_BLOCK_VIEW_TARGET: readonly [number, number, number] = [
  0, 0.15, 0,
];

/**
 * Square striking block (inches), sized to the 2" gavel head so it doesn't
 * dwarf the gavel in the same viewer.
 *
 * The photos show one machined block with a cap molding, not a stack of steps.
 * Bottom to top: a plain vertical body for about two thirds of the height, a
 * rounded bullnose that swells out past the body and casts the shadow line
 * under the cap, a narrow shelf, then a steep wall up to the raised top panel
 * that gets personalized.
 *
 * Because the bullnose is the widest point, the body reads as tucked under the
 * molding — getting that overhang backwards is what made earlier versions look
 * like a wedding cake.
 */
export const SOUND_BLOCK_W_IN = 3.15;
export const SOUND_BLOCK_D_IN = 3.15;
export const SOUND_BLOCK_FOOT_H_IN = 0.05;

/** How far the body sits inside the bullnose's widest point, per side. */
const SOUND_BLOCK_BODY_INSET_IN = 0.032;
const SOUND_BLOCK_BULLNOSE_R_IN = 0.085;
const SOUND_BLOCK_BULLNOSE_TOP_Y_IN = 0.89;
const SOUND_BLOCK_BULLNOSE_SEGS = 7;
/** Radius of the softened arris around the raised top panel. */
const SOUND_BLOCK_TOP_ROUND_IN = 0.03;
const SOUND_BLOCK_TOP_ROUND_SEGS = 4;

/**
 * One horizontal ring of the block's edge profile: `inset` is how far the
 * perimeter is drawn in from the widest point, so the same list drives all four
 * sides. Ordered bottom to top.
 */
export type SoundBlockRing = { y: number; inset: number };

/**
 * The convex cap molding, swept from where it leaves the body face out to the
 * widest point and back in to level at the shelf.
 */
function bullnoseRings(): SoundBlockRing[] {
  const centerY = SOUND_BLOCK_BULLNOSE_TOP_Y_IN - SOUND_BLOCK_BULLNOSE_R_IN;
  const start = -Math.acos(
    1 - SOUND_BLOCK_BODY_INSET_IN / SOUND_BLOCK_BULLNOSE_R_IN,
  );
  const rings: SoundBlockRing[] = [];
  for (let i = 0; i <= SOUND_BLOCK_BULLNOSE_SEGS; i++) {
    const a = start + (i / SOUND_BLOCK_BULLNOSE_SEGS) * (Math.PI / 2 - start);
    rings.push({
      y: centerY + SOUND_BLOCK_BULLNOSE_R_IN * Math.sin(a),
      inset: SOUND_BLOCK_BULLNOSE_R_IN * (1 - Math.cos(a)),
    });
  }
  return rings;
}

function topRoundoverRings(
  baseY: number,
  baseInset: number,
): SoundBlockRing[] {
  const rings: SoundBlockRing[] = [];
  for (let i = 1; i <= SOUND_BLOCK_TOP_ROUND_SEGS; i++) {
    const a = (i / SOUND_BLOCK_TOP_ROUND_SEGS) * (Math.PI / 2);
    rings.push({
      y: baseY + SOUND_BLOCK_TOP_ROUND_IN * Math.sin(a),
      inset: baseInset + SOUND_BLOCK_TOP_ROUND_IN * (1 - Math.cos(a)),
    });
  }
  return rings;
}

export const SOUND_BLOCK_PROFILE: readonly SoundBlockRing[] = [
  { y: 0, inset: SOUND_BLOCK_BODY_INSET_IN + 0.028 },
  { y: 0.03, inset: SOUND_BLOCK_BODY_INSET_IN },
  ...bullnoseRings(),
  // Shelf runs nearly flat off the top of the bullnose, then the panel wall
  // goes up steeply — a shallow ramp here reads as a bevel instead of a step.
  { y: 0.9, inset: 0.19 },
  { y: 0.925, inset: 0.205 },
  { y: 1.03, inset: 0.23 },
  ...topRoundoverRings(1.03, 0.23),
];

/** Block height above the feet. */
export const SOUND_BLOCK_H_IN =
  SOUND_BLOCK_PROFILE[SOUND_BLOCK_PROFILE.length - 1].y;

/** Flat top of the raised panel — the only personalizable surface. */
export const SOUND_BLOCK_TOP_FACE_W_IN =
  SOUND_BLOCK_W_IN -
  2 * SOUND_BLOCK_PROFILE[SOUND_BLOCK_PROFILE.length - 1].inset;

export const SOUND_BLOCK_BODY_H_IN = SOUND_BLOCK_H_IN + SOUND_BLOCK_FOOT_H_IN;

export function soundBlockGroundY(): number {
  return -SOUND_BLOCK_BODY_H_IN / 2;
}

/**
 * Presentation stand from the product photos (inches): long block with a sloped
 * front for the nameplate, and two seating recesses in the flat top that the
 * gavel settles into. Wood always matches the gavel.
 *
 * Length is set so the gavel spans the stand with the margin the photos show
 * (measured against the 2" head in the front-face shot).
 */
/** Bump when stand/plate meshes change so the preview remounts after hot reload. */
export const STAND_GEOMETRY_REVISION = 2;

export const STAND_LENGTH_IN = 11.4;
export const STAND_WIDTH_IN = 4.55;
export const STAND_HEIGHT_IN = 1.38;
/**
 * The front is not one slope down to the table. It angles down from the top
 * edge and lands on a wooden ledge that runs the length of the stand, with the
 * rubber feet under that.
 *
 * The ledge stands proud of the angled face rather than sitting flush with it,
 * so there is a narrow shelf along the top of it. That shelf is what reads as a
 * ledge in the product shots — built flush it just looks like more of the same
 * face. Height is 21 px of the 104 px front in the head-on photo, taking the
 * bottom at the step into the contact shadow rather than at the end of it. The
 * projection is judged off the three-quarter shot, where the lit shelf runs
 * about a third of the ledge's own face.
 */
export const STAND_LEDGE_H_IN = 0.29;
/** Forward step of the footer strip below the sloped face (product photo ~⅓ of footer height). */
export const STAND_LEDGE_PROJ_IN = 0.32;
/**
 * Run and rise describe the angled part only, so rise is the height above the
 * ledge rather than the whole body.
 */
export const STAND_BEVEL_RUN_IN = 1.12;
export const STAND_BEVEL_RISE_IN = STAND_HEIGHT_IN - STAND_LEDGE_H_IN;
/** Rubber feet under the ledge. */
export const STAND_FOOT_H_IN = 0.06;

/** Z of the footer lip's forward edge (frontmost point of the stand). */
export function standLedgeFrontZ(): number {
  return STAND_WIDTH_IN / 2;
}
/** Z where the sloped face meets the top of the footer strip. */
export function standSlopeBottomZ(): number {
  return standLedgeFrontZ() - STAND_LEDGE_PROJ_IN;
}
/** Y of the top of the footer strip / bottom of the sloped face. */
export function standFooterTopY(): number {
  return STAND_FOOT_H_IN + STAND_LEDGE_H_IN;
}
/** Length of the sloped face above the footer (inches along the plane). */
export function standSlopeLengthIn(): number {
  return Math.hypot(STAND_BEVEL_RUN_IN, STAND_BEVEL_RISE_IN);
}
/**
 * Front plaque, measured off the reference photo.
 *
 * Everything here is derived as a ratio rather than an absolute pixel count,
 * because the photo and the render look at the stand from different heights and
 * the sloped face foreshortens differently in each. Width is taken against the
 * 11.4" stand length (unforeshortened either way); height and placement are
 * taken against the sloped face itself, since the plate lies in that same plane
 * and so shares its foreshortening whatever the camera does.
 *
 * In the photo the plate is 639 px wide where the stand is 908, and 80 px tall
 * where the face is 94.5.
 */
export const STAND_PLATE_W_IN = 8.03;
/**
 * The plaque spans most of the angled face — 0.847 of the slope in the
 * head-on photo — leaving a thin wood margin above and below.
 */
export const STAND_PLATE_H_IN = 0.847 * standSlopeLengthIn();
export const STAND_PLATE_T_IN = 0.035;

/**
 * Concave notch at each corner of the bounding rectangle. See standPlateOutline.
 * Measured at ~9% of plate height in the front-face product photo.
 */
export const STAND_PLATE_CORNER_R_IN = 0.14 * STAND_PLATE_H_IN;

/** Engraved keyline following the outline, inset from the physical edge. */
export const STAND_PLATE_KEYLINE_INSET_IN = 0.0875 * STAND_PLATE_H_IN;
export const STAND_PLATE_KEYLINE_W_IN = 0.03;

/**
 * Centred on the angled face. t = 0 is the footer shelf, t = 1 is the top edge.
 */
export const STAND_PLATE_ALONG_SLOPE = 0.5;

/** Plate artwork canvas, kept at the plate's own aspect so the keyline is even. */
export const STAND_PLATE_TEXTURE_W_PX = 2048;
export const STAND_PLATE_TEXTURE_H_PX = Math.round(
  (2048 * STAND_PLATE_H_IN) / STAND_PLATE_W_IN,
);

/**
 * Where the gavel's head sits on the stand. The stand is centered on the origin
 * and +X runs toward the handle tip, so this centers the whole gavel — head on
 * the left, tip stopping short of the right end, as in the photos.
 */
export const STAND_GAVEL_X_IN = -3.76;

/**
 * Seating recesses routed into the top face, measured off the front-face photo
 * against the known 2" head.
 *
 * How much of the head's bottom bead the wood hides gives the head depth: on a
 * bare surface roughly 0.57" of bead would show below its widest point, and only
 * about 0.31" does. The handle end is barely let in by comparison, which is why
 * the gavel lies flatter in the photo than it would on a flat top.
 *
 * Depths drive the resting angle (see gavelRestPoseInWells), so changing one
 * re-seats the gavel automatically rather than needing the pose re-tuned.
 */
export const STAND_HEAD_WELL_DEPTH_IN = 0.28;
export const STAND_TIP_WELL_DEPTH_IN = 0.07;

/**
 * The head recess is round, just clearing the head's widest bead;
 * scripts/check-gavel-on-stand.mts reports the minimum radius it needs.
 */
export const STAND_HEAD_WELL_R_IN = 1.02;

/** Rounded bottom edge, so the head recess reads routed rather than punched. */
export const STAND_WELL_FILLET_IN = 0.05;
/** Slight draft on the wall, as a router bit leaves. */
export const STAND_WELL_TAPER_IN = 0.02;

/**
 * The handle end lies in an oblong cove instead, running along the handle so it
 * beds down into the groove rather than bridging a round hole. The handle meets
 * the top face at a shallow angle, so over an inch of it runs below the surface
 * before the end cap — hence a slot rather than a dimple.
 *
 * Half-length is of the groove's centerline; the rounded ends add half-width on
 * top of it. Width has to exceed the handle's half thickness at the surface or
 * the handle would sit on the rims instead of in the groove.
 */
export const STAND_TIP_WELL_HALF_LEN_IN = 0.33;
export const STAND_TIP_WELL_HALF_W_IN = 0.36;

/**
 * Centers of the two recesses along the stand. These are where the submerged
 * part of the gavel actually lands, which is not the same as its head axis or
 * handle end — the check script reports both so they can be kept in step.
 */
export const STAND_HEAD_WELL_X_IN = -3.83;
export const STAND_TIP_WELL_X_IN = 4.23;

/** Center of the flat top face (accounts for the front bevel eating into +Z). */
export function standFlatTopCenterZ(): number {
  const zBack = -STAND_WIDTH_IN / 2;
  return (zBack + standTopFrontZ()) / 2;
}

/** Z where the angled face meets the top face. */
export function standTopFrontZ(): number {
  return standSlopeBottomZ() - STAND_BEVEL_RUN_IN;
}

export const STAND_PLATE_MAX_LINES = 2;

export function standGroundY(): number {
  return 0;
}

export function standBodyTopY(): number {
  return STAND_FOOT_H_IN + STAND_HEIGHT_IN;
}

/**
 * The stand's top face under the gavel's head. Callers offset the gavel from
 * here by the rest pose's lift (see gavelRestPoseInWells), which is solved from
 * the turned profiles and the well depths rather than stored here.
 */
export function gavelStandContactPoint(): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: STAND_GAVEL_X_IN,
    y: standBodyTopY(),
    z: standFlatTopCenterZ(),
  };
}

/**
 * Three-quarter of the stand with the gavel resting on it.
 *
 * Pulled back far enough that the whole stand clears the frame on the first
 * render. Seen from this three-quarter angle the block spans just under 12",
 * and the 28° lens only covered about 7" at the previous distance, so both
 * ends were cropped until the user zoomed out by hand.
 */
export const STAND_VIEW_CAMERA_POSITION: readonly [number, number, number] = [
  13.2, 10.7, 19.4,
];

/** Raised toward the middle of the stand-plus-gavel mass, not the bare block. */
export const STAND_VIEW_TARGET: readonly [number, number, number] = [
  0, 1.4, 0.2,
];

/**
 * Handle shaft length from collar to tip (inches), not including head.
 * Measured off the drawing (8.36" exposed → 10.25" overall).
 */
export const GAVEL_HANDLE_LENGTH_IN = 8.36;

/** Canvas texture resolution for the unwrapped band. */
export const GAVEL_BAND_TEXTURE_WIDTH_PX = 2048;
export const GAVEL_BAND_TEXTURE_HEIGHT_PX = 256;

/** Square canvas for personalization on the sound-block top. */
export const SOUND_BLOCK_TOP_TEXTURE_PX = 1024;

export const GAVEL_MAX_LINES = 4;

export const GAVEL_DEFAULT_FONT = "Georgia";

export const GAVEL_DEFAULT_TEXT_COLOR = "#1a1a1a";

export const GAVEL_BAND_GOLD_HEX = "#d2a84a";
export const GAVEL_BAND_GOLD_DARK_HEX = "#8a6a1e";
export const GAVEL_BAND_SILVER_HEX = "#c8ccd2";

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
  thumbSrc: string;
};

export const GAVEL_STYLES: readonly GavelStyleDef[] = [
  {
    id: "walnut",
    label: "American Walnut",
    description: "Rich warm walnut.",
    bodyColor: "#6a4736",
    roughness: 1.8,
    metalness: 0,
    grainTint: "#38241c",
    useWoodGrain: true,
    textureSet: "walnut",
    thumbSrc: "/images/gavel/thumb-walnut.jpg",
  },
  {
    id: "rubberwood",
    label: "Hardwood",
    description: "Hardwood with a cherry finish",
    bodyColor: "#805346",
    roughness: 1.7,
    metalness: 0,
    grainTint: "#4a2b22",
    useWoodGrain: true,
    textureSet: "rubberwood",
    thumbSrc: "/images/gavel/thumb-rubberwood.jpg",
  },
  {
    id: "ebony",
    label: "Ebony",
    description: "Deep satin black.",
    bodyColor: "#212327",
    roughness: 2.1,
    metalness: 0,
    grainTint: "#0a0a0c",
    useWoodGrain: true,
    textureSet: "ebony",
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

export const GAVEL_PRODUCT_TYPE_OPTIONS: readonly {
  id: GavelProductType;
  label: string;
  description: string;
  photoSrc: string;
}[] = [
  {
    id: "gavel",
    label: "Gavel",
    description: "Custom band, with or without sound block",
    photoSrc: "/images/gavel/product-walnut-block-angle.jpg",
  },
  {
    id: "stand",
    label: "Gavel + stand",
    description: "Matching wood stand with a custom front plate",
    photoSrc: "/images/gavel/product-walnut-stand-front.jpg",
  },
];

export const GAVEL_SOUND_BLOCK_OPTIONS: readonly {
  id: GavelSoundBlockId;
  label: string;
  photoSrc: string;
}[] = [
  {
    id: "none",
    label: "Gavel only",
    photoSrc: "/images/gavel/product-rubberwood-gavel.jpg",
  },
  {
    id: "plain",
    label: "+ Sound block, plain",
    photoSrc: "/images/gavel/product-ebony-block.jpg",
  },
  {
    id: "engraved",
    label: "+ Sound block, personalized",
    photoSrc: "/images/gavel/product-soundblock-engraved.jpg",
  },
];

export const GAVEL_STAND_FINISH_OPTIONS: readonly {
  id: GavelStandFinishId;
  label: string;
  plateHex: string;
  /** Full-color UV print is not offered on gold/silver plates. */
  allowsUvPrint: boolean;
  note: string;
}[] = [
  {
    id: "gold",
    label: "Gold",
    plateHex: GAVEL_BAND_GOLD_HEX,
    allowsUvPrint: false,
    note: "Gold and silver plates are personalized — text or logo, single color.",
  },
  {
    id: "silver",
    label: "Silver",
    plateHex: GAVEL_BAND_SILVER_HEX,
    allowsUvPrint: false,
    note: "Gold and silver plates are personalized — text or logo, single color.",
  },
];

export const GAVEL_PRODUCTION_METHOD_OPTIONS: readonly {
  id: GavelProductionMethodId;
  label: string;
}[] = [
  { id: "engrave", label: "Personalized" },
  { id: "uvprint", label: "Custom — full color" },
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

/** Woods we no longer offer, mapped to the closest current one so old orders still open. */
const LEGACY_STYLE_ALIASES: Record<string, GavelStyleId> = {
  mahogany: "rubberwood",
  metal: "ebony",
  oak: "walnut",
  purple: "rubberwood",
};

export function getGavelStyle(id: string | null | undefined): GavelStyleDef {
  const mapped = id ? LEGACY_STYLE_ALIASES[id] ?? id : "walnut";
  return GAVEL_STYLES.find((s) => s.id === mapped) ?? GAVEL_STYLES[0];
}

/** Contrast color for text printed on the sound-block wood top. */
export function getSoundBlockTopTextColor(
  styleId: string | null | undefined,
): string {
  const id = getGavelStyle(styleId).id;
  if (id === "ebony") return "#f3ead8";
  return GAVEL_DEFAULT_TEXT_COLOR;
}

export function getGavelBandFinish(
  id: string | null | undefined,
): (typeof GAVEL_BAND_FINISHES)[number] {
  return GAVEL_BAND_FINISHES.find((f) => f.id === id) ?? GAVEL_BAND_FINISHES[0];
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
): string {
  const style = getGavelStyle(styleId);
  const band = getGavelBandFinish(bandFinishId);
  return `${style.label} · ${band.label} band`;
}

/** Retired plate finishes mapped so old drafts still resolve. */
const LEGACY_STAND_FINISH_ALIASES: Record<string, GavelStandFinishId> = {
  white: "gold",
};

export function getGavelStandFinish(
  id: string | null | undefined,
): (typeof GAVEL_STAND_FINISH_OPTIONS)[number] {
  const mapped = id ? LEGACY_STAND_FINISH_ALIASES[id] ?? id : "gold";
  return (
    GAVEL_STAND_FINISH_OPTIONS.find((f) => f.id === mapped) ??
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
 * Studio photos keyed by `wood|kit` and, where a second finish was shot,
 * `wood|kit|finish`. Coverage is uneven: there is no ebony gavel-only or
 * ebony stand shot, and silver only exists for the walnut stand and the
 * ebony sound block. Add files here as more shots arrive.
 */
const GAVEL_PRODUCT_PHOTOS: Readonly<Record<string, string>> = {
  "walnut|gavel": "/images/gavel/product-walnut-gavel.jpg",
  "walnut|block": "/images/gavel/product-walnut-block.jpg",
  "walnut|stand": "/images/gavel/product-walnut-stand.jpg",
  "walnut|stand|silver": "/images/gavel/product-walnut-stand-silver.jpg",
  "rubberwood|gavel": "/images/gavel/product-rubberwood-gavel.jpg",
  "rubberwood|block": "/images/gavel/product-rubberwood-block.jpg",
  "rubberwood|stand": "/images/gavel/product-rubberwood-stand.jpg",
  "ebony|block": "/images/gavel/product-ebony-block.jpg",
  "ebony|block|silver": "/images/gavel/product-ebony-block-silver.jpg",
};

/**
 * Closest real photo for a wood/kit we never shot.
 *
 * Ebony gavel-only falls back to the ebony sound-block shot: the wood the
 * customer just picked is what this tab exists to show, so matching the
 * colour beats matching the exact bundle. The ebony stand has no ebony
 * photo at all, so it borrows the walnut stand.
 */
const GAVEL_PRODUCT_PHOTO_FALLBACKS: Readonly<Record<string, string>> = {
  "ebony|gavel": "ebony|block",
  "ebony|stand": "walnut|stand",
};

/** Photo of the real product matching the configuration being designed. */
export function getGavelProductPhoto(
  styleId: string | null | undefined,
  productType: string | null | undefined,
  soundBlockId: string | null | undefined,
  finishId: string | null | undefined,
): string {
  const wood = getGavelStyle(styleId).id;
  const kit =
    productType === "stand"
      ? "stand"
      : getGavelSoundBlock(soundBlockId).id === "none"
        ? "gavel"
        : "block";

  const key = `${wood}|${kit}`;
  const resolved = GAVEL_PRODUCT_PHOTO_FALLBACKS[key] ?? key;

  return (
    (finishId === "silver"
      ? GAVEL_PRODUCT_PHOTOS[`${resolved}|silver`]
      : undefined) ??
    GAVEL_PRODUCT_PHOTOS[resolved] ??
    GAVEL_PRODUCT_PHOTOS["walnut|gavel"]
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
    const bag = input.suedeBag ? "Suede bag" : "No bag";
    return `Gavel + stand · ${finish.label} plate · ${method.label} · ${bag}`;
  }
  const parts = [getGavelSoundBlock(input.soundBlock).label];
  parts.push(input.suedeBag ? "Suede bag" : "No bag");
  return parts.join(" · ");
}
