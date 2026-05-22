import React, { memo } from "react";
import {
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_BODY,
  BADGE_AQB_PRINT_COLOURS_DISCLAIMER_TITLE,
} from "../constants/manufacturingDisclaimer";

export const AqbBadgeTrustAndDisclaimer = memo(
  function AqbBadgeTrustAndDisclaimer() {
    return (
      <div className="aqb-badge-trust-disclaimer">
        <div className="aqb-trust-strip">
          <div className="aqb-ts-item">
            <span className="aqb-ts-icon" aria-hidden>
              🚚
            </span>
            Free USA shipping on every order
          </div>
          <div className="aqb-ts-item">
            <span className="aqb-ts-icon" aria-hidden>
              ⚡
            </span>
            Ships in 2 business days
          </div>
          <div className="aqb-ts-item">
            <span className="aqb-ts-icon" aria-hidden>
              🏭
            </span>
            Manufactured in our US facility
          </div>
          <div className="aqb-ts-item">
            <span className="aqb-ts-icon" aria-hidden>
              ✏️
            </span>
            Artwork generates automatically on order
          </div>
          <div className="aqb-ts-item">
            <span className="aqb-ts-icon" aria-hidden>
              🔁
            </span>
            <span>
              <span className="text-[#c8962a] font-medium">Sign in</span> on the
              storefront to save and reorder in one click
            </span>
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
