import React, { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import {
  BADGE_AQB_BACKING_META,
  BADGE_AQB_BACKING_ORDER,
  type BadgeBackingKey,
  badgeAqbBackingOptionLabel,
  badgeAqbBackingPriceLabel,
} from "../constants/badgeAqbBacking";
import { AqbBackingIcon } from "./AqbRedesignIcons";

interface AqbBadgeBackingPickerProps {
  value: BadgeBackingKey;
  onChange: (value: BadgeBackingKey) => void;
}

export const AqbBadgeBackingPicker: React.FC<AqbBadgeBackingPickerProps> = ({
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const meta = BADGE_AQB_BACKING_META[value];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="aqb-badge-backing-step">
      <div className="aqb-backing-select-wrap" ref={wrapRef}>
        <button
          type="button"
          id="backing-select"
          className={`aqb-backing-select-trigger ${open ? "is-open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="aqb-backing-select-trigger-label">
            <AqbBackingIcon
              backing={value}
              className="h-4 w-4 stroke-[1.75] text-[#3a4f63]"
            />
            {badgeAqbBackingOptionLabel(value)}
          </span>
          <span className="aqb-backing-chevron" aria-hidden>
            ▼
          </span>
        </button>

        {open ? (
          <ul className="aqb-backing-select-menu" role="listbox">
            {BADGE_AQB_BACKING_ORDER.map((key) => {
              const selected = key === value;
              return (
                <li key={key} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`aqb-backing-select-option ${
                      selected ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                  >
                    <span className="aqb-backing-option-check">
                      {selected ? (
                        <CheckIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                      ) : null}
                    </span>
                    <span className="aqb-backing-option-icon" aria-hidden>
                      <AqbBackingIcon backing={key} className="h-4 w-4 stroke-[1.75]" />
                    </span>
                    <span className="aqb-backing-option-label">
                      {badgeAqbBackingOptionLabel(key)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="aqb-backing-info">
        <div className="aqb-bi-icon" aria-hidden>
          <AqbBackingIcon backing={value} />
        </div>
        <div className="aqb-bi-body">
          <div className="aqb-bi-name">
            <span>{meta.fullName}</span>
            {meta.popular ? (
              <span className="aqb-bi-popular">Most popular</span>
            ) : null}
          </div>
          <p className="aqb-bi-desc">{meta.description}</p>
        </div>
        <div className="aqb-bi-price">
          <div className="aqb-bi-price-val">
            {badgeAqbBackingPriceLabel(value) === "included"
              ? "Included"
              : badgeAqbBackingPriceLabel(value)}
          </div>
          <div className="aqb-bi-modifier">per badge</div>
        </div>
      </div>
    </div>
  );
};
