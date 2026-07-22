import React, { memo } from "react";
import { BADGE_AQB_ORDER_FREE_SHIP_MIN } from "../constants/badgeAqbOrderQty";
import {
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_BODY,
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE,
  DESK_SIGN_PRINT_COLOURS_DISCLAIMER_BODY,
  DESK_SIGN_PRINT_COLOURS_DISCLAIMER_TITLE,
} from "../constants/manufacturingDisclaimer";

export type AqbTrustProduct = "badge" | "desk-sign";

export interface AqbBadgeTrustAndDisclaimerProps {
  /** Defaults to badge copy so existing call sites stay unchanged. */
  product?: AqbTrustProduct;
  freeShipMin?: number;
}

export const AqbBadgeTrustAndDisclaimer = memo(
  function AqbBadgeTrustAndDisclaimer({
    product = "badge",
    freeShipMin = BADGE_AQB_ORDER_FREE_SHIP_MIN,
  }: AqbBadgeTrustAndDisclaimerProps) {
    const isDeskSign = product === "desk-sign";
    const freeShipNoun = isDeskSign ? "desk signs" : "badges";
    const disclaimerTitle = isDeskSign
      ? DESK_SIGN_PRINT_COLOURS_DISCLAIMER_TITLE
      : BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE;
    const disclaimerBody = isDeskSign
      ? DESK_SIGN_PRINT_COLOURS_DISCLAIMER_BODY
      : BADGE_AQB_PRINT_COLOURS_DISCLAIMER_BODY;

    return (
      <div className="aqb-badge-trust-disclaimer">
        <div className="aqb-trust-strip">
          <div className="aqb-trust-strip-col">
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                🚚
              </span>
              Free USA shipping (on orders of {freeShipMin} {freeShipNoun} or
              more)
            </div>
          </div>
          <div className="aqb-trust-strip-col">
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                🔁
              </span>
              <span>
                <span className="text-[#ED8918] font-medium">Sign in</span> on
                the storefront to save and reorder in one click
              </span>
            </div>
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                ✏️
              </span>
              Artwork generates automatically on order
            </div>
          </div>
        </div>
        <div
          className="aqb-print-colours-disclaimer"
          role="note"
          aria-label={disclaimerTitle}
        >
          <strong>{disclaimerTitle}</strong> {disclaimerBody}
        </div>
      </div>
    );
  },
);
