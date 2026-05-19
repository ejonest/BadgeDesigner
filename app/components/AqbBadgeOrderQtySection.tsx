import React, { memo, useEffect, useMemo, useState } from "react";
import type { BadgeBackingKey } from "../constants/badgeAqbBacking";
import { computeBadgeAqbOrderQtyUiModel } from "../constants/badgeAqbOrderQty";

export interface AqbBadgeOrderQtySectionProps {
  qty: number;
  onQtyChange: (next: number) => void;
  backingKey: BadgeBackingKey;
  designCount: number;
  onAddToCart: () => void;
  addToCartDisabled: boolean;
  isAddingToCart: boolean;
}

function clampQty(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999_999, Math.floor(n)));
}

export const AqbBadgeOrderQtySection = memo(function AqbBadgeOrderQtySection({
  qty,
  onQtyChange,
  backingKey,
  designCount,
  onAddToCart,
  addToCartDisabled,
  isAddingToCart,
}: AqbBadgeOrderQtySectionProps) {
  /** `qty` is total badges to order (same semantics as `badgeOrderQty` in the designer). */
  const m = useMemo(
    () =>
      computeBadgeAqbOrderQtyUiModel(qty, backingKey, {
        designCount,
        totalPieces: qty,
      }),
    [qty, backingKey, designCount],
  );

  const clampedQty = clampQty(qty);
  const [qtyInputText, setQtyInputText] = useState(() =>
    String(clampedQty),
  );

  useEffect(() => {
    setQtyInputText(String(clampedQty));
  }, [clampedQty]);

  const grandFmt = `$${m.grandTotal.toFixed(2)}`;
  const saveFmt = `$${m.savingAmount.toFixed(2)}`;
  const breakdown =
    designCount > 1
      ? `${m.qty} badges total · ${designCount} designs · $${m.perUnit.toFixed(2)} ea · ${m.backingWord}`
      : `${m.qty} × $${m.perUnit.toFixed(2)} · ${m.backingWord}`;

  return (
    <div className="aqb-bq-qty-section">
      <div className="aqb-bq-qty-header">
        <div className="aqb-bq-qty-title">How many badges do you need?</div>
        <div
          className={`aqb-bq-qty-hint${m.hintWarn ? " shipping-warn" : ""}`}
        >
          {m.hintText}
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

      <div className="aqb-bq-tier-btns" role="group" aria-label="Quantity tiers">
        {m.tierChips.map((chip) => (
          <button
            key={chip.anchor}
            type="button"
            className={`aqb-bq-tier-btn${chip.active ? " active" : ""}${
              chip.shipsFree ? " ships-free" : " paid-ship"
            }${chip.popular ? " pop" : ""}`}
            onClick={() => onQtyChange(clampQty(chip.anchor))}
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
          </button>
        ))}
      </div>

      <div className="aqb-bq-savings-bar-wrap">
        <div className="aqb-bq-sb-label">
          <span>More badges = lower price + free shipping</span>
          <span>{m.savingsBarLabel}</span>
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
          {m.markerLabels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className={
                label.includes("✓")
                  ? "aqb-bq-sb-marker free-marker"
                  : "aqb-bq-sb-marker"
              }
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="aqb-bq-custom-row">
        <span className="aqb-bq-custom-label">Custom qty:</span>
        <div className="aqb-bq-qty-stepper">
          <button
            type="button"
            className="aqb-bq-qs-btn"
            aria-label="Decrease quantity"
            disabled={clampedQty <= 1}
            onClick={() => {
              const next = clampQty(clampedQty - 1);
              onQtyChange(next);
            }}
          >
            −
          </button>
          <input
            className="aqb-bq-qs-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={qtyInputText}
            aria-label="Custom quantity"
            onChange={(e) => {
              setQtyInputText(e.target.value);
            }}
            onBlur={() => {
              const v = parseInt(qtyInputText, 10);
              if (Number.isNaN(v) || v < 1) {
                onQtyChange(1);
              } else {
                onQtyChange(clampQty(v));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <button
            type="button"
            className="aqb-bq-qs-btn"
            aria-label="Increase quantity"
            onClick={() => {
              const next = clampQty(clampedQty + 1);
              onQtyChange(next);
            }}
          >
            +
          </button>
        </div>
        <span className={`aqb-bq-custom-tier-note ${m.tierNoteTone}`}>
          {m.tierNoteText}
        </span>
      </div>

      <div className="aqb-bq-total-strip">
        <div className="aqb-bq-ts-left">
          <div className="aqb-bq-ts-total">{grandFmt}</div>
          <div className="aqb-bq-ts-breakdown">{breakdown}</div>
          <div className={`aqb-bq-ts-ship ${m.freeShip ? "free" : "paid"}`}>
            {m.freeShip ? "+ Free USA shipping" : "+ $5.99 shipping (est.)"}
          </div>
        </div>
        <div className="aqb-bq-ts-mid">
          <div className="aqb-bq-ts-save">Save {saveFmt}</div>
          <div className="aqb-bq-ts-save-sub">vs. buying 1 at a time</div>
        </div>
        <button
          type="button"
          className="aqb-bq-ts-atc-btn"
          disabled={addToCartDisabled || isAddingToCart}
          onClick={() => onAddToCart()}
        >
          {isAddingToCart ? "Adding…" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
});
