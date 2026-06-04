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
  /** Opens add-multiple when user clicks the free-shipping upsell. */
  onFreeShippingUpsellClick?: () => void;
}

export const AqbBadgeOrderQtySection = memo(function AqbBadgeOrderQtySection({
  qty,
  designCount,
  backingKey,
  onFreeShippingUpsellClick,
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

  const orderCountLabel =
    pieces === 0
      ? "No badge designs yet"
      : `${pieces} badge${pieces === 1 ? "" : "s"} in your order`;

  const showFreeShipUpsell = pieces > 0 && !m.freeShip && m.hintWarn;

  const renderFreeShipUpsell = (text: string, className?: string) => {
    if (!showFreeShipUpsell || !onFreeShippingUpsellClick) {
      return text;
    }
    return (
      <button
        type="button"
        className={`aqb-bq-free-ship-upsell-link${className ? ` ${className}` : ""}`}
        onClick={onFreeShippingUpsellClick}
        title="Add multiple badges"
      >
        {text}
      </button>
    );
  };

  return (
    <div className="aqb-bq-qty-section">
      <div className="aqb-bq-qty-header">
        <div className="aqb-bq-qty-title">Your order</div>
        <div
          className={`aqb-bq-qty-hint${m.hintWarn ? " shipping-warn" : ""}`}
        >
          {pieces === 0
            ? "Add a badge design to see pricing"
            : renderFreeShipUpsell(m.hintText)}
        </div>
      </div>

      <div className={`aqb-bq-shipping-notice ${m.shippingVariant}`}>
        <div className="aqb-bq-sn-icon" aria-hidden>
          🚚
        </div>
        <div>
          <div className="aqb-bq-sn-main">{m.shippingMain}</div>
          <div className="aqb-bq-sn-sub">
            {renderFreeShipUpsell(m.shippingSub)}
          </div>
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
                : `${pieces} badge${pieces === 1 ? "" : "s"} ordered — ${Math.max(0, BADGE_AQB_ORDER_FREE_SHIP_MIN - pieces)} more to get free shipping`}
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
            : renderFreeShipUpsell(m.tierNoteText)}
        </span>
      </div>

      <div className="aqb-bq-checkout-footer">
        <AqbBadgeTrustAndDisclaimer />
      </div>
    </div>
  );
});
