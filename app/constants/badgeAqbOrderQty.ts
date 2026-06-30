import {
  type BadgeBackingKey,
  badgeAqbOrderBackingUplift,
} from "./badgeAqbBacking";

export type { BadgeBackingKey } from "./badgeAqbBacking";

/** Reference mock: volume tiers (per-badge base before backing uplift). */
export const BADGE_AQB_ORDER_TIERS = [
  { min: 1, max: 1, p: 4.99, save: 0 },
  { min: 2, max: 9, p: 3.99, save: 20 },
  { min: 10, max: 24, p: 2.99, save: 40 },
  { min: 25, max: 49, p: 2.49, save: 50 },
  { min: 50, max: 99, p: 1.99, save: 60 },
  { min: 100, max: 249, p: 1.49, save: 70 },
  { min: 250, max: 999_999, p: 1.19, save: 76 },
] as const;

export const BADGE_AQB_ORDER_SHIP_FEE = 5.99;
/** Free USA shipping when total badge count in the editor reaches this. */
export const BADGE_AQB_ORDER_FREE_SHIP_MIN = 5;

/** Short upsell for checkout panel — free shipping only (bulk tiers disabled for now). */
export function formatBadgeAqbFreeShippingUpsell(
  orderCount: number,
  goal: number = BADGE_AQB_ORDER_FREE_SHIP_MIN,
): string | null {
  const count = Math.max(0, Math.floor(orderCount));
  if (count <= 0 || count >= goal) return null;
  const remaining = goal - count;
  return `Add ${remaining} more to get free shipping`;
}

/** Progress fill width (0–100): 0 badges = 0%, each badge aligns with its marker (n/goal). */
export function badgeAqbFreeShipProgressWidthPct(
  orderCount: number,
  goal: number = BADGE_AQB_ORDER_FREE_SHIP_MIN,
): number {
  const c = Math.max(0, Math.floor(orderCount));
  if (c <= 0) return 0;
  if (c >= goal) return 100;
  return (c / goal) * 100;
}

/** Marker tick position (0–100): label `n` sits at n/goal so fill meets the number. */
export function badgeAqbFreeShipMarkerLeftPct(
  markerIndex1Based: number,
  goal: number = BADGE_AQB_ORDER_FREE_SHIP_MIN,
): number {
  const n = Math.max(1, Math.min(goal, Math.floor(markerIndex1Based)));
  return (n / goal) * 100;
}

/** Tier chip anchors (display-only; quantity comes from editor designs). */
export const BADGE_AQB_ORDER_TIER_ANCHORS = [1, 5, 10, 25, 100, 250] as const;

export { badgeAqbOrderBackingUplift };

export function getBadgeAqbOrderTierForQty(qty: number) {
  const q = Math.max(1, Math.floor(qty));
  return (
    BADGE_AQB_ORDER_TIERS.find((t) => q >= t.min && q <= t.max) ??
    BADGE_AQB_ORDER_TIERS[BADGE_AQB_ORDER_TIERS.length - 1]
  );
}

export function getBadgeAqbOrderTierAnchorData(
  anchor: number,
  backing: BadgeBackingKey,
) {
  const tier = getBadgeAqbOrderTierForQty(anchor);
  const uplift = badgeAqbOrderBackingUplift(backing);
  const pu = tier.p + uplift;
  return { tier, pu, save: tier.save };
}

/** Split total physical badge count across `lineCount` cart lines (each ≥ 1). */
export function splitOrderTotalAcrossDesignLines(
  lineCount: number,
  totalPieces: number,
): number[] {
  const n = Math.max(1, Math.floor(lineCount));
  const t = Math.max(n, Math.floor(totalPieces));
  const base = Math.floor(t / n);
  const rem = t % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export type BadgeAqbOrderQtyUiModel = {
  qty: number;
  hintText: string;
  hintWarn: boolean;
  shippingVariant: "free" | "paid";
  shippingMain: string;
  shippingSub: string;
  savingsBarWidthPct: number;
  savingsBarGradient: string;
  savingsBarLabel: string;
  tierNoteText: string;
  tierNoteTone: "free" | "unlock";
  /** Shown near Add to cart (e.g. “Add 3 more to get free shipping”). */
  addToCartUpsellText: string | null;
  grandTotal: number;
  perUnit: number;
  savingAmount: number;
  backingWord: string;
  freeShip: boolean;
  tierChips: Array<{
    anchor: number;
    priceLabel: string;
    saveLabel: string;
    shipsFree: boolean;
    popular: boolean;
    active: boolean;
  }>;
  markerLabels: string[];
};

export function computeBadgeAqbOrderQtyUiModel(
  qtyRaw: number,
  backing: BadgeBackingKey,
  opts?: { designCount?: number; totalPieces?: number },
): BadgeAqbOrderQtyUiModel {
  const designCount = Math.max(
    1,
    Math.min(999, Math.floor(Number(opts?.designCount) || 1)),
  );
  const qty = Math.max(1, Math.min(999_999, Math.floor(Number(qtyRaw) || 1)));
  const hasExplicitTotal =
    typeof opts?.totalPieces === "number" && Number.isFinite(opts.totalPieces);
  const orderCount = hasExplicitTotal
    ? Math.max(
        0,
        Math.min(999_999, Math.floor(opts.totalPieces as number)),
      )
    : Math.max(0, qty * designCount);
  /** Pricing/tier math uses at least 1; progress bar uses orderCount (0 = empty bar). */
  const pricingPieces = Math.max(1, orderCount);
  const tierBasis = hasExplicitTotal ? pricingPieces : qty;
  const tier = getBadgeAqbOrderTierForQty(tierBasis);
  const uplift = badgeAqbOrderBackingUplift(backing);
  const pu = tier.p + uplift;
  const freeShipPieces = orderCount >= BADGE_AQB_ORDER_FREE_SHIP_MIN;
  const ship = freeShipPieces ? 0 : BADGE_AQB_ORDER_SHIP_FEE;
  const badgeTotal = pu * pricingPieces;
  const grandTotal = orderCount > 0 ? badgeTotal + ship : 0;
  const refPu = BADGE_AQB_ORDER_TIERS[0].p + uplift;
  const savingAmount = Math.max(0, (refPu - pu) * pricingPieces);
  const toFreePieces = Math.max(0, BADGE_AQB_ORDER_FREE_SHIP_MIN - orderCount);

  let hintText: string;
  let hintWarn = false;
  if (!freeShipPieces && toFreePieces > 0) {
    hintText = `Add ${toFreePieces} more to get free shipping`;
    hintWarn = true;
  } else if (freeShipPieces) {
    hintText = "Free USA shipping unlocked";
  } else if (orderCount > 0) {
    hintText = `${orderCount} badge${orderCount === 1 ? "" : "s"} in your order`;
  } else {
    hintText = "Add a badge design to start";
  }

  let shippingMain: string;
  let shippingSub: string;
  let shippingVariant: "free" | "paid";
  if (freeShipPieces) {
    shippingVariant = "free";
    shippingMain = "Free USA shipping included";
    shippingSub = `Orders of ${BADGE_AQB_ORDER_FREE_SHIP_MIN}+ badges always ship free`;
  } else {
    shippingVariant = "paid";
    shippingMain = `$${BADGE_AQB_ORDER_SHIP_FEE.toFixed(2)} shipping — free on orders of ${BADGE_AQB_ORDER_FREE_SHIP_MIN}+ badges`;
    shippingSub = `Add ${toFreePieces} more to get free shipping`;
  }

  const freeShipGoal = BADGE_AQB_ORDER_FREE_SHIP_MIN;
  const savingsBarWidthPct = badgeAqbFreeShipProgressWidthPct(
    orderCount,
    freeShipGoal,
  );
  const savingsBarGradient = freeShipPieces
    ? "linear-gradient(90deg,#ED8918,#2D9E75)"
    : "linear-gradient(90deg,#ED8918,#F5A84D)";
  const savingsBarLabel = freeShipPieces
    ? "Free shipping unlocked"
    : orderCount > 0
      ? `${orderCount} of ${freeShipGoal} badges`
      : `0 of ${freeShipGoal} badges`;

  let tierNoteText: string;
  let tierNoteTone: "free" | "unlock";
  if (!freeShipPieces) {
    tierNoteText = `Add ${toFreePieces} more to get free shipping`;
    tierNoteTone = "unlock";
  } else {
    tierNoteText = "Free USA shipping included";
    tierNoteTone = "free";
  }

  const addToCartUpsellText = formatBadgeAqbFreeShippingUpsell(orderCount);

  const backingWord =
    backing === "magnetic"
      ? "magnetic"
      : backing === "pin"
        ? "pin"
        : "adhesive";

  const currentTier = tier;
  const tierChips = BADGE_AQB_ORDER_TIER_ANCHORS.map((anchor) => {
    const chipTier = getBadgeAqbOrderTierForQty(anchor);
    const td = getBadgeAqbOrderTierAnchorData(anchor, backing);
    const shipsFree = anchor >= BADGE_AQB_ORDER_FREE_SHIP_MIN;
    const paidShip = !shipsFree;
    const saveLabel = paidShip
      ? "+$5.99 ship"
      : td.save > 0
        ? `−${td.save}%`
        : "";
    return {
      anchor,
      priceLabel: `$${td.pu.toFixed(2)}`,
      saveLabel,
      shipsFree,
      popular: anchor === 25,
      active:
        chipTier.min === currentTier.min && chipTier.max === currentTier.max,
    };
  });

  const markerLabels = Array.from({ length: freeShipGoal }, (_, i) => {
    const n = i + 1;
    return n === freeShipGoal && freeShipPieces ? `${n} ✓` : String(n);
  });

  return {
    qty: orderCount,
    hintText,
    hintWarn,
    shippingVariant,
    shippingMain,
    shippingSub,
    savingsBarWidthPct,
    savingsBarGradient,
    savingsBarLabel,
    tierNoteText,
    tierNoteTone,
    addToCartUpsellText,
    grandTotal,
    perUnit: pu,
    savingAmount,
    backingWord,
    freeShip: freeShipPieces,
    tierChips,
    markerLabels,
  };
}
