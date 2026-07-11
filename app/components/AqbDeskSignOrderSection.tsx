import React, { memo } from "react";
import { AqbBadgeTrustAndDisclaimer } from "./AqbBadgeTrustAndDisclaimer";

const DESK_SIGN_FREE_SHIP_MIN = 5;

export interface AqbDeskSignOrderSectionProps {
  designCount: number;
  priceLabel: string;
}

export const AqbDeskSignOrderSection = memo(function AqbDeskSignOrderSection({
  designCount,
  priceLabel,
}: AqbDeskSignOrderSectionProps) {
  const count = Math.max(0, designCount);
  const freeShip = count >= DESK_SIGN_FREE_SHIP_MIN;
  const shippingVariant = freeShip ? "shipping-free" : "shipping-paid";

  const hintText =
    count === 0
      ? "Add a desk sign design to see pricing"
      : priceLabel === "—"
        ? "Finish material and text steps to see pricing"
        : priceLabel;

  const shippingMain = freeShip
    ? "Free USA shipping on this order"
    : "$5.99 shipping — free on orders of 5+ desk signs";

  const shippingSub =
    count === 0
      ? `Free USA shipping when you order ${DESK_SIGN_FREE_SHIP_MIN} or more`
      : freeShip
        ? "You've unlocked free shipping"
        : `${Math.max(0, DESK_SIGN_FREE_SHIP_MIN - count)} more sign${
            DESK_SIGN_FREE_SHIP_MIN - count === 1 ? "" : "s"
          } for free shipping`;

  const savingsBarWidthPct =
    count === 0 ? 0 : Math.min(100, (count / DESK_SIGN_FREE_SHIP_MIN) * 100);

  return (
    <div className="aqb-bq-qty-section">
      <div className="aqb-bq-qty-header">
        <div className="aqb-bq-qty-title">Your order</div>
        <div className={`aqb-bq-qty-hint${count > 0 && !freeShip ? " shipping-warn" : ""}`}>
          {hintText}
        </div>
      </div>

      <div className={`aqb-bq-shipping-notice ${shippingVariant}`}>
        <div className="aqb-bq-sn-icon" aria-hidden>
          🚚
        </div>
        <div>
          <div className="aqb-bq-sn-main">{shippingMain}</div>
          <div className="aqb-bq-sn-sub">{shippingSub}</div>
        </div>
      </div>

      <div className="aqb-bq-savings-bar-wrap">
        <div className="aqb-bq-sb-label">
          <span>
            {count === 0
              ? `Free USA shipping on orders of ${DESK_SIGN_FREE_SHIP_MIN}+ desk signs`
              : freeShip
                ? "You've unlocked free USA shipping"
                : `${count} desk sign${count === 1 ? "" : "s"} — ${Math.max(
                    0,
                    DESK_SIGN_FREE_SHIP_MIN - count,
                  )} more for free shipping`}
          </span>
          <span>{count === 0 ? "—" : freeShip ? "Free ship ✓" : ""}</span>
        </div>
        <div className="aqb-bq-sb-track">
          <div
            className="aqb-bq-sb-fill"
            style={{
              width: `${savingsBarWidthPct}%`,
              background: freeShip
                ? "linear-gradient(90deg, #2d9e75 0%, #3ecf8e 100%)"
                : "linear-gradient(90deg, #ed8918 0%, #f5a84d 100%)",
            }}
          />
        </div>
      </div>

      <div className="aqb-bq-editor-qty-note">
        <span className="aqb-bq-editor-qty-count">
          {count === 0
            ? "No desk sign designs yet"
            : `${count} desk sign${count === 1 ? "" : "s"} in your order`}
        </span>
        <span className={`aqb-bq-editor-qty-tier-note ${freeShip ? "tier-good" : "tier-warn"}`}>
          {count === 0
            ? "Choose a material to get started"
            : freeShip
              ? "Free shipping applied at checkout"
              : "Add more signs to unlock free shipping"}
        </span>
      </div>

      <div className="aqb-bq-checkout-footer">
        <AqbBadgeTrustAndDisclaimer />
      </div>
    </div>
  );
});
