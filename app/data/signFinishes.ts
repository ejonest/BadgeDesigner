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

export function signShapeHasFinishes(shapeTypeId: string): boolean {
  return SIGN_FINISHES.some((finish) => finish.shapeTypeId === shapeTypeId);
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
