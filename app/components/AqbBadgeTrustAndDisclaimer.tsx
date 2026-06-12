import React, { memo } from "react";
import { BADGE_AQB_ORDER_FREE_SHIP_MIN } from "../constants/badgeAqbOrderQty";
import {
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_BODY,
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE,
} from "../constants/manufacturingDisclaimer";
import { UsFlagIcon } from "./AqbRedesignIcons";

export const AqbBadgeTrustAndDisclaimer = memo(
  function AqbBadgeTrustAndDisclaimer() {
    return (
      <div className="aqb-badge-trust-disclaimer">
        <div className="aqb-trust-strip">
          <div className="aqb-trust-strip-col">
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                🚚
              </span>
              Free USA shipping (on orders of {BADGE_AQB_ORDER_FREE_SHIP_MIN}{" "}
              badges or more)
            </div>
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                <UsFlagIcon />
              </span>
              Made to Order in the USA
            </div>
          </div>
          <div className="aqb-trust-strip-col">
            <div className="aqb-ts-item">
              <span className="aqb-ts-icon" aria-hidden>
                🔁
              </span>
              <span>
                <span className="text-[#c8962a] font-medium">Sign in</span> on
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
          aria-label={BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE}
        >
          <strong>{BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE}</strong>{" "}
          {BADGE_AQB_PRINT_COLOURS_DISCLAIMER_BODY}
        </div>
      </div>
    );
  },
);
