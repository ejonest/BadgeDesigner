import React, { memo, useMemo } from "react";
import type { BadgeBackingKey } from "../constants/badgeAqbBacking";
import {
  BADGE_AQB_ORDER_FREE_SHIP_MIN,
  badgeAqbFreeShipMarkerLeftPct,
  computeBadgeAqbOrderQtyUiModel,
} from "../constants/badgeAqbOrderQty";
import { AqbBadgeTrustAndDisclaimer } from "./AqbBadgeTrustAndDisclaimer";

export interface AqbBadgeOrderQtySectionProps {
  /** Total physical badges = number of designs in the editor (read-only here). */
  qty: number;
  designCount: number;
  backingKey: BadgeBackingKey;
  onAddToCart: () => void;
  addToCartDisabled: boolean;
  /** When true, ATC uses bright yellow; otherwise grey (incomplete design). */
  addToCartReady: boolean;
  isAddingToCart: boolean;
}

export const AqbBadgeOrderQtySection = memo(function AqbBadgeOrderQtySection({
  qty,
  designCount,
  backingKey,
  onAddToCart,
  addToCartDisabled,
  addToCartReady,
  isAddingToCart,
}: AqbBadgeOrderQtySectionProps) {
  const pieces = Math.max(0, Math.floor(qty));
  const m = useMemo(
    () =>
      computeBadgeAqbOrderQtyUiModel(Math.max(1, pieces || 1), backingKey, {
        designCount: Math.max(0, designCount),
        totalPieces: pieces,
      }),
    [pieces, backingKey, designCount],
  );

  const grandFmt = `$${m.grandTotal.toFixed(2)}`;
  const saveFmt = `$${m.savingAmount.toFixed(2)}`;
  const breakdown =
    designCount > 1
      ? `${pieces} badge${pieces === 1 ? "" : "s"} total · ${designCount} designs · $${m.perUnit.toFixed(2)} ea · ${m.backingWord}`
      : `${pieces} × $${m.perUnit.toFixed(2)} · ${m.backingWord}`;

  const orderCountLabel =
    pieces === 0
      ? "No badge designs yet"
      : `${pieces} badge${pieces === 1 ? "" : "s"} in your order`;

  return (
    <div className="aqb-bq-qty-section">
      <div className="aqb-bq-qty-header">
        <div className="aqb-bq-qty-title">Your order</div>
        <div
          className={`aqb-bq-qty-hint${m.hintWarn ? " shipping-warn" : ""}`}
        >
          {pieces === 0 ? "Add a badge design to see pricing" : m.hintText}
        </div>
      </div>

      <div className={`aqb-bq-shipping-notice ${m.shippingVariant}`}>
        <div className="aqb-bq-sn-icon" aria-hidden>
          🚚
        </div>
        <div>
          <div className="aqb-bq-sn-main">{m.shippingMain}</div>
          <div className="aqb-bq-sn-sub">{m.shippingSub}</div>
        </div>
      </div>

      {/* Volume tier cards — hidden while pricing stays static (re-enable when tier UI returns). */}
      {/*
      <div
        className="aqb-bq-tier-btns"
        role="list"
        aria-label="Volume pricing tiers"
      >
        {m.tierChips.map((chip) => (
          <div
            key={chip.anchor}
            role="listitem"
            className={`aqb-bq-tier-chip${chip.active ? " active" : ""}${
              chip.shipsFree ? " ships-free" : " paid-ship"
            }${chip.popular ? " pop" : ""}`}
            aria-current={chip.active ? "true" : undefined}
          >
            {chip.popular ? (
              <div className="aqb-bq-pop-flag">★ Popular</div>
            ) : null}
            {chip.shipsFree ? (
              <div className="aqb-bq-free-ship-flag">Free ship</div>
            ) : null}
            <div className="aqb-bq-tb-q">{chip.anchor}</div>
            <div className="aqb-bq-tb-p">{chip.priceLabel}</div>
            <div className="aqb-bq-tb-s">{chip.saveLabel}</div>
          </div>
        ))}
      </div>
      */}

      <div className="aqb-bq-savings-bar-wrap">
        <div className="aqb-bq-sb-label">
          <span>
            {pieces === 0
              ? `Free USA shipping on orders of ${BADGE_AQB_ORDER_FREE_SHIP_MIN}+ badges`
              : m.freeShip
                ? "You've unlocked free USA shipping"
                : `${pieces} badge${pieces === 1 ? "" : "s"} ordered — ${Math.max(0, BADGE_AQB_ORDER_FREE_SHIP_MIN - pieces)} more for free shipping`}
          </span>
          <span>{pieces === 0 ? "—" : m.savingsBarLabel}</span>
        </div>
        <div className="aqb-bq-sb-track">
          <div
            className="aqb-bq-sb-fill"
            style={{
              width: `${m.savingsBarWidthPct}%`,
              background: m.savingsBarGradient,
            }}
          />
        </div>
        <div className="aqb-bq-sb-markers">
          {m.markerLabels.map((label, i) => {
            const markerNum = i + 1;
            const leftPct = badgeAqbFreeShipMarkerLeftPct(markerNum);
            const isLast = markerNum === BADGE_AQB_ORDER_FREE_SHIP_MIN;
            return (
              <span
                key={`${label}-${i}`}
                className={
                  label.includes("✓")
                    ? "aqb-bq-sb-marker free-marker"
                    : "aqb-bq-sb-marker"
                }
                style={{
                  left: `${leftPct}%`,
                  transform: isLast ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="aqb-bq-editor-qty-note">
        <span className="aqb-bq-editor-qty-count">{orderCountLabel}</span>
        <span className={`aqb-bq-editor-qty-tier-note ${m.tierNoteTone}`}>
          {pieces === 0
            ? "Use duplicate or add design in the editor"
            : m.tierNoteText}
        </span>
      </div>
      <p className="aqb-bq-editor-qty-help">
        To change quantity, use Grid View (per design or set all), or add
        duplicate designs in the editor.
      </p>

      <div className="aqb-bq-checkout-footer">
        <div className="aqb-bq-checkout-atc-col">
          <div className="aqb-bq-checkout-atc-pricing">
            <div className="aqb-bq-ts-total">{pieces === 0 ? "—" : grandFmt}</div>
            <div className="aqb-bq-ts-breakdown">
              {pieces === 0
                ? "Pricing updates when you add a design"
                : breakdown}
            </div>
            <div
              className={`aqb-bq-ts-ship ${pieces === 0 ? "paid" : m.freeShip ? "free" : "paid"}`}
            >
              {pieces === 0
                ? "Est. shipping at checkout"
                : m.freeShip
                  ? "+ Free USA shipping"
                  : "+ $5.99 shipping (est.)"}
            </div>
            <div className="aqb-bq-checkout-save">
              <div className="aqb-bq-ts-save">
                {pieces === 0 ? "—" : `Save ${saveFmt}`}
              </div>
              <div className="aqb-bq-ts-save-sub">vs. buying 1 at a time</div>
            </div>
          </div>
          <button
            type="button"
            className={`aqb-atc-btn aqb-bq-ts-atc-btn aqb-bq-ts-atc-btn--tall ${
              addToCartReady ? "aqb-atc-btn--ready" : "aqb-atc-btn--inactive"
            }`}
            disabled={addToCartDisabled || isAddingToCart || pieces === 0}
            onClick={() => onAddToCart()}
          >
            {isAddingToCart ? "Adding…" : "Add to cart"}
          </button>
        </div>
        <AqbBadgeTrustAndDisclaimer />
      </div>
    </div>
  );
});
