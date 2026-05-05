/**
 * Plaque designer: layout families (step 2) + physical sizes (step 1).
 * Full template ids: `{layoutId}-{size}` e.g. `plaque-attached-medium`.
 */

export type PlaqueSizeKey = "small" | "medium" | "large";

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
    name: "Attached plate",
    description:
      "One metal plate: your image at the top and text centered below on the same plate.",
    thumbnailTemplateId: "plaque-attached-medium",
  },
  {
    id: "plaque-detached-portrait",
    name: "Detached photo (portrait)",
    description:
      "Portrait photo in a frame on the wood; text is engraved on a separate metal plate below.",
    thumbnailTemplateId: "plaque-detached-portrait-medium",
  },
  {
    id: "plaque-detached-landscape",
    name: "Detached photo (landscape)",
    description:
      "Landscape photo in a frame on the wood; text is engraved on a separate metal plate below.",
    thumbnailTemplateId: "plaque-detached-landscape-medium",
  },
];

export const PLAQUE_SIZE_STEP_OPTIONS: readonly {
  value: PlaqueSizeKey;
  label: string;
  detail: string;
}[] = [
  {
    value: "small",
    label: "Small",
    detail: '5×7" wood · 4×6" plate (attached layout only)',
  },
  {
    value: "medium",
    label: "Medium",
    detail: '8×10" wood (plate & photo vary by layout)',
  },
  {
    value: "large",
    label: "Large",
    detail: '9×12" wood (plate & photo vary by layout)',
  },
];

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
