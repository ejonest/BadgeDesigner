import { findSignTypeAndSizeForUniversalTemplate } from "~/constants/designerVariants";
import signFinishesJson from "./signFinishCatalog.generated";

export type SignFinishOption = {
  id: string;
  shapeTypeId: string;
  label: string;
  group: string;
  imageSrc: string;
  backgroundColor: string;
  inkColor: string;
};

type SignFinishFile = {
  version: number;
  finishes: SignFinishOption[];
};

const FINISH_PAIR_LABELS: Record<string, string> = {
  "Black Gold": "Black / Gold",
  "Black Silver": "Black / Silver",
  "Black White": "Black / White",
  "Blue White": "Blue / White",
  "Dark Brown White": "Dark brown / White",
  "Ivory Dark brown": "Ivory / Dark brown",
  "Light Grey Black": "Light grey / Black",
  "Navy blue Gold": "Navy blue / Gold",
  "Navy blue White": "Navy blue / White",
  "Red Black": "Red / Black",
  "Red White": "Red / White",
  "Walnut White": "Walnut / White",
  "White Black": "White / Black",
  "White Red": "White / Red",
  "White Walnut": "White / Walnut",
  "Yellow Black": "Yellow / Black",
  "Amber Black": "Amber / Black",
  "Black Orange": "Black / Orange",
  "Black Yellow": "Black / Yellow",
  "Dark Red White": "Dark red / White",
  "Orange Black": "Orange / Black",
  "Yellow Crimson": "Yellow / Crimson",
  "Yellow Navy": "Yellow / Navy",
  "Beige Dark Brown": "Beige / Dark brown",
};

export const SIGN_FINISHES: readonly SignFinishOption[] =
  ((signFinishesJson as unknown as SignFinishFile).finishes ?? []).map(
    (finish) => ({
      ...finish,
      label: FINISH_PAIR_LABELS[finish.label] ?? finish.label,
    }),
  );

const finishById = new Map(SIGN_FINISHES.map((finish) => [finish.id, finish]));

export function getSignFinishById(
  id: string | null | undefined,
): SignFinishOption | undefined {
  return id ? finishById.get(id) : undefined;
}

export function getSignFinishesForShape(
  shapeTypeId: string | null | undefined,
): SignFinishOption[] {
  if (!shapeTypeId) return [];
  return SIGN_FINISHES.filter(
    (finish) => finish.shapeTypeId === shapeTypeId,
  );
}

/** White plate with black ink — the reset look for a shape. */
export function whiteSignFinishForShape(
  shapeTypeId: string | null | undefined,
): SignFinishOption | undefined {
  const finishes = getSignFinishesForShape(shapeTypeId);
  return (
    finishes.find((finish) => finish.label === "White / Black") ??
    finishes.find((finish) => finish.label.startsWith("White")) ??
    finishes.find(
      (finish) => finish.backgroundColor.trim().toUpperCase() === "#FFFFFF",
    )
  );
}

export function signShapeHasFinishes(shapeTypeId: string): boolean {
  return SIGN_FINISHES.some((finish) => finish.shapeTypeId === shapeTypeId);
}

function perceivedLuminance(hex: string): number {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length < 6) return 1;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) return 1;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Finish photos that are dark even when the stored plate hex is light
 * (dark oak, brushed silver, and a few mislabeled rustic plates).
 */
function finishPhotoIsDark(finish: SignFinishOption): boolean {
  return /(?:^|-)(?:dark-oak|oak|white-walnut|brush-gold|brush-silver|brushed-silver|rustic-dark-blue-wood)(?:-|$)/.test(
    finish.id,
  );
}

/**
 * Text color to apply when a finish is chosen. Keeps a light accent such as
 * gold, and switches near-black ink to white on a dark plate.
 */
export function signFinishDefaultTextColor(finish: SignFinishOption): string {
  const plateIsDark =
    perceivedLuminance(finish.backgroundColor) <= 0.5 ||
    finishPhotoIsDark(finish);
  const inkIsDark = perceivedLuminance(finish.inkColor) <= 0.5;
  if (plateIsDark && inkIsDark) return "#FFFFFF";
  return finish.inkColor;
}

/** First stock photo for a shape, used before the customer picks a finish. */
export function defaultSignFinishForShape(
  shapeTypeId: string | null | undefined,
): SignFinishOption | undefined {
  const finishes = getSignFinishesForShape(shapeTypeId);
  return (
    finishes.find((finish) => finish.group === "Core colors") ?? finishes[0]
  );
}

/**
 * Finish photo to draw for a sign template. Keeps an explicit finish when it
 * belongs to the shape, otherwise the shape's default photo.
 */
export function resolveDisplayedSignFinish(
  templateId: string | null | undefined,
  signFinishId: string | null | undefined,
): SignFinishOption | undefined {
  if (!templateId) return undefined;
  const shapeId = findSignTypeAndSizeForUniversalTemplate(templateId)?.typeId;
  if (!shapeId) return undefined;
  const selected = getSignFinishById(signFinishId);
  if (selected?.shapeTypeId === shapeId) return selected;
  return defaultSignFinishForShape(shapeId);
}
