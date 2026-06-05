import {
  BADGE_CONSTANTS,
  getBadgePriceForBacking,
} from "./badge";

export type BadgeBackingKey = "magnetic" | "pin" | "adhesive";

export const BADGE_AQB_BACKING_ORDER: BadgeBackingKey[] = [
  "magnetic",
  "pin",
  "adhesive",
];

export const BADGE_AQB_BACKING_META: Record<
  BadgeBackingKey,
  {
    shortName: string;
    fullName: string;
    description: string;
    popular?: boolean;
  }
> = {
  magnetic: {
    shortName: "Magnetic",
    fullName: "Magnetic backing",
    description:
      "Strong magnetic clip — no holes in clothing. Best for most uses.",
    popular: true,
  },
  pin: {
    shortName: "Pin",
    fullName: "Pin backing",
    description:
      "Classic pin clutch — secure and familiar for everyday wear.",
  },
  adhesive: {
    shortName: "Adhesive",
    fullName: "Adhesive backing",
    description:
      "Peel-and-stick backing — no pinholes. Great for temporary wear.",
  },
};

/** Uplift above adhesive base — used by attachment picker and order qty tier UI. */
export function badgeAqbOrderBackingUplift(key: BadgeBackingKey): number {
  return (
    getBadgePriceForBacking(key) -
    BADGE_CONSTANTS.BADGE_PRICES_BY_BACKING.adhesive
  );
}

/** Relative modifier for Step 4 attachment picker (+$X or included). */
export function badgeAqbBackingModifierLabel(key: BadgeBackingKey): string {
  const uplift = badgeAqbOrderBackingUplift(key);
  if (uplift <= 0) return "included";
  return `+$${uplift.toFixed(2)}`;
}

/** Display in attachment dropdown and info card — relative to adhesive. */
export function badgeAqbBackingPriceLabel(key: BadgeBackingKey): string {
  return badgeAqbBackingModifierLabel(key);
}

export function badgeAqbBackingOptionLabel(key: BadgeBackingKey): string {
  const meta = BADGE_AQB_BACKING_META[key];
  return `${meta.shortName} — ${badgeAqbBackingModifierLabel(key)}`;
}

/** Absolute per-badge price for cart, checkout summary, and line item properties. */
export function badgeAqbBackingAbsolutePriceLabel(
  key: BadgeBackingKey | string | undefined | null,
): string {
  return `$${getBadgePriceForBacking(key).toFixed(2)}`;
}
