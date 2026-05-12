/**
 * Plaque designer: layout families (step 2) + physical sizes (step 1).
 * Full template ids: `{layoutId}-{size}` e.g. `plaque-attached-medium`.
 */

export type PlaqueSizeKey = "small" | "medium" | "large";

/** Attached plate + current award-format presets: four user text lines max. Detached plaques may use more. */
export const ATTACHED_PLAQUE_MAX_TEXT_LINES = 4;

export type PlaqueLayoutOption = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Representative template for thumbnails (medium). */
  readonly thumbnailTemplateId: string;
};

export const PLAQUE_LAYOUT_OPTIONS: readonly PlaqueLayoutOption[] = [
  {
    id: "plaque-attached",
    name: "Attached plate — (S, M, & L)",
    description:
      "One metal plate: your image at the top and text centered below on the same plate.",
    thumbnailTemplateId: "plaque-attached-medium",
  },
  {
    id: "plaque-detached-portrait",
    name: "Photo plaque — portrait (M & L)",
    description:
      "Photo in a frame on the wood; text is engraved on a separate metal plate below.",
    thumbnailTemplateId: "plaque-detached-portrait-medium",
  },
  {
    id: "plaque-detached-landscape",
    name: "Photo plaque — landscape (M & L)",
    description:
      'Portrait wood board (8×10" or 9×12") with a landscape photo opening; text is engraved on a separate metal plate below.',
    thumbnailTemplateId: "plaque-detached-landscape-medium",
  },
];

/** Step 2 size keys in display order (labels come from {@link getPlaqueSizeStepDisplay}). */
export type PlaqueSizeStepOption = {
  readonly value: PlaqueSizeKey;
};

export const PLAQUE_SIZE_STEP_OPTIONS: readonly PlaqueSizeStepOption[] = [
  { value: "small" },
  { value: "medium" },
  { value: "large" },
];

const SIZE_STEP_LABEL: Record<PlaqueSizeKey, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/**
 * Physical specs for size chips (wood frame = template outer size).
 * Attached plate: inner metal from plaque SVG `Inner` path vs viewBox.
 * Detached landscape: design-sheet notes on template SVGs.
 * Detached portrait: photo opening from `plaquePhotoRectNorm` × frame; plate from `Inner` path.
 */
const ATTACHED_SIZE_SPECS: Record<
  PlaqueSizeKey,
  { frame: string; plate: string }
> = {
  small: { frame: '5×7"', plate: '4×6"' },
  medium: { frame: '8×10"', plate: '6×8"' },
  large: { frame: '9×12"', plate: '7×10"' },
};

const DETACHED_PORTRAIT_SIZE_SPECS: Record<
  "medium" | "large",
  { frame: string; photoSlot: string; plate: string }
> = {
  medium: {
    frame: '8×10"',
    photoSlot: '4.5×6.5"',
    plate: '6×2"',
  },
  large: {
    frame: '9×12"',
    photoSlot: '5.5×7.5"',
    plate: '6×2"',
  },
};

const DETACHED_LANDSCAPE_SIZE_SPECS: Record<
  "medium" | "large",
  { frame: string; photoSlot: string; plate: string }
> = {
  medium: {
    frame: '8×10"',
    photoSlot: '6.5×4.5"',
    plate: '6×3.5"',
  },
  large: {
    frame: '9×12"',
    photoSlot: '7.5×5.5"',
    plate: '7×4"',
  },
};

export type PlaqueSizeStepDisplay = {
  readonly primaryLine: string;
  readonly detailLines: readonly string[];
};

/** Primary + secondary lines for Step 2 size buttons; defaults to attached specs when layout is unknown. */
export function getPlaqueSizeStepDisplay(
  layoutId: string | null | undefined,
  size: PlaqueSizeKey,
): PlaqueSizeStepDisplay {
  const layout = layoutId?.trim() || "plaque-attached";
  const label = SIZE_STEP_LABEL[size];

  if (layout === "plaque-detached-portrait") {
    const key = size === "small" ? "medium" : size;
    const spec = DETACHED_PORTRAIT_SIZE_SPECS[key];
    return {
      primaryLine: `${label} - Frame size: ${spec.frame}`,
      detailLines: [
        `Photo slot size: ${spec.photoSlot}`,
        `Plate size: ${spec.plate}`,
      ],
    };
  }

  if (layout === "plaque-detached-landscape") {
    const key = size === "small" ? "medium" : size;
    const spec = DETACHED_LANDSCAPE_SIZE_SPECS[key];
    return {
      primaryLine: `${label} - Frame size: ${spec.frame}`,
      detailLines: [
        `Photo slot size: ${spec.photoSlot}`,
        `Plate size: ${spec.plate}`,
      ],
    };
  }

  const spec = ATTACHED_SIZE_SPECS[size];
  return {
    primaryLine: `${label} - Frame size: ${spec.frame}`,
    detailLines: [`Plate size: ${spec.plate}`],
  };
}

export function isPlaqueDetachedLayoutId(layoutId: string): boolean {
  return (
    layoutId === "plaque-detached-portrait" ||
    layoutId === "plaque-detached-landscape"
  );
}

/** Size chips for Step 2: detached layouts omit Small (not manufactured). */
export function getPlaqueSizeStepOptionsForLayout(
  layoutId: string | null | undefined,
): readonly (typeof PLAQUE_SIZE_STEP_OPTIONS)[number][] {
  if (layoutId && isPlaqueDetachedLayoutId(layoutId)) {
    return PLAQUE_SIZE_STEP_OPTIONS.filter((o) => o.value !== "small");
  }
  return PLAQUE_SIZE_STEP_OPTIONS;
}

/** Detached layouts do not offer small; coerce to medium. */
export function normalizePlaqueSizeForLayout(
  layoutId: string,
  size: PlaqueSizeKey,
): PlaqueSizeKey {
  if (isPlaqueDetachedLayoutId(layoutId) && size === "small") return "medium";
  return size;
}

export function buildPlaqueTemplateId(
  layoutId: string,
  size: PlaqueSizeKey,
): string {
  const s = normalizePlaqueSizeForLayout(layoutId, size);
  return `${layoutId}-${s}`;
}

const PLAQUE_TEMPLATE_RE =
  /^(plaque-attached|plaque-detached-portrait|plaque-detached-landscape)-(small|medium|large)$/;

export function parsePlaqueTemplateId(
  templateId: string | undefined,
): { layoutId: string; size: PlaqueSizeKey } | null {
  const id = templateId?.trim() ?? "";
  const m = id.match(PLAQUE_TEMPLATE_RE);
  if (!m) return null;
  return { layoutId: m[1], size: m[2] as PlaqueSizeKey };
}

export const DEFAULT_PLAQUE_LAYOUT_ID = PLAQUE_LAYOUT_OPTIONS[0].id;
export const DEFAULT_PLAQUE_SIZE: PlaqueSizeKey = "medium";

export function defaultPlaqueTemplateId(): string {
  return buildPlaqueTemplateId(DEFAULT_PLAQUE_LAYOUT_ID, DEFAULT_PLAQUE_SIZE);
}
