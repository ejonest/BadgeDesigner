export type BadgeBackingKey = "magnetic" | "pin" | "adhesive";

/** Reference mock prices for AQB redesign UI (cart/checkout uses BADGE_CONSTANTS.BACKING_PRICES). */
const BADGE_AQB_BACKING_DISPLAY_PRICE: Record<
  BadgeBackingKey,
  number | "included"
> = {
  magnetic: 1,
  pin: 0.5,
  adhesive: "included",
};

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

/** Display price for AQB redesign dropdown and info card. */
export function badgeAqbBackingPriceLabel(key: BadgeBackingKey): string {
  const display = BADGE_AQB_BACKING_DISPLAY_PRICE[key];
  if (display === "included") return "included";
  return `+$${display.toFixed(2)}`;
}

export function badgeAqbBackingOptionLabel(key: BadgeBackingKey): string {
  const meta = BADGE_AQB_BACKING_META[key];
  return `${meta.shortName} — ${badgeAqbBackingPriceLabel(key)}`;
}
