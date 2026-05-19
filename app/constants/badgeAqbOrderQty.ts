import type { BadgeBackingKey } from "./badgeAqbBacking";

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
export const BADGE_AQB_ORDER_FREE_SHIP_MIN = 10;

/** Tier chip anchors (qty set when user taps a chip) — matches reference. */
export const BADGE_AQB_ORDER_TIER_ANCHORS = [1, 5, 10, 25, 100, 250] as const;

/** Uplift used with mock tier base (reference HTML), not Shopify variant price. */
export function badgeAqbOrderBackingUplift(key: BadgeBackingKey): number {
  const u: Record<BadgeBackingKey, number> = {
    magnetic: 1,
    pin: 0.5,
    adhesive: 0,
  };
  return u[key] ?? 0;
}

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
  const pieces = hasExplicitTotal
    ? Math.max(1, Math.min(999_999, Math.floor(opts.totalPieces as number)))
    : qty * designCount;
  const tierBasis = hasExplicitTotal ? pieces : qty;
  const tier = getBadgeAqbOrderTierForQty(tierBasis);
  const uplift = badgeAqbOrderBackingUplift(backing);
  const pu = tier.p + uplift;
  const freeShipPieces = pieces >= BADGE_AQB_ORDER_FREE_SHIP_MIN;
  const ship = freeShipPieces ? 0 : BADGE_AQB_ORDER_SHIP_FEE;
  const badgeTotal = pu * pieces;
  const grandTotal = badgeTotal + ship;
  const refPu = BADGE_AQB_ORDER_TIERS[0].p + uplift;
  const savingAmount = Math.max(0, (refPu - pu) * pieces);
  const toFreePieces = Math.max(0, BADGE_AQB_ORDER_FREE_SHIP_MIN - pieces);
  const nextTier = BADGE_AQB_ORDER_TIERS.find((t) => t.min > tierBasis);

  let hintText: string;
  let hintWarn = false;
  if (!freeShipPieces && toFreePieces > 0) {
    hintText = `Add ${toFreePieces} more badge${
      toFreePieces !== 1 ? "s" : ""
    } total to unlock free shipping`;
    hintWarn = true;
  } else if (tier.save > 0) {
    hintText = `You're saving ${tier.save}% at this quantity`;
  } else {
    hintText = "Add more badges for volume discounts";
    hintWarn = true;
  }

  let shippingMain: string;
  let shippingSub: string;
  let shippingVariant: "free" | "paid";
  if (freeShipPieces) {
    shippingVariant = "free";
    shippingMain = "Free USA shipping included";
    shippingSub = "Orders of 10+ badges always ship free";
  } else {
    shippingVariant = "paid";
    shippingMain = "$5.99 shipping applies — orders under 10 badges";
    shippingSub = `Add ${toFreePieces} more badge${
      toFreePieces !== 1 ? "s" : ""
    } total to unlock free shipping`;
  }

  const savingsBarWidthPct = Math.min(100, Math.max(0, tier.save));
  const savingsBarGradient = freeShipPieces
    ? "linear-gradient(90deg,#C8962A,#2D9E75)"
    : "linear-gradient(90deg,#C8962A,#E0AC42)";
  const savingsBarLabel =
    tier.save > 0 ? `${tier.save}% saved` : "No discount yet";

  let tierNoteText: string;
  let tierNoteTone: "free" | "unlock";
  if (!freeShipPieces) {
    tierNoteText = `Add ${toFreePieces} more → free shipping`;
    tierNoteTone = "unlock";
  } else if (nextTier) {
    tierNoteText = `Next tier: ${nextTier.min} → $${nextTier.p.toFixed(2)} ea`;
    tierNoteTone = "free";
  } else {
    tierNoteText = "250+ · best rate";
    tierNoteTone = "free";
  }

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

  const markerLabels = BADGE_AQB_ORDER_TIER_ANCHORS.map((m) =>
    m === 10 && freeShipPieces ? "10 ✓" : String(m),
  );

  return {
    qty: pieces,
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
    grandTotal,
    perUnit: pu,
    savingAmount,
    backingWord,
    freeShip: freeShipPieces,
    tierChips,
    markerLabels,
  };
}
