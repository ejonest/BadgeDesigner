import React from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import {
  BADGE_ICON_IDS,
  type BadgeIconId,
  badgeIconPublicSrc,
  BADGE_ICON_LABELS,
} from "../constants/badgeIcons";

interface AqbBadgeIconPickerProps {
  value: BadgeIconId | undefined;
  onChange: (value: BadgeIconId | undefined) => void;
  /** Compact grid for Step 2 background panel (with corner style). */
  variant?: "default" | "inline";
}

export const AqbBadgeIconPicker: React.FC<AqbBadgeIconPickerProps> = ({
  value,
  onChange,
  variant = "default",
}) => {
  const noneSelected = value == null;
  const inline = variant === "inline";

  return (
    <div
      className={
        inline
          ? "aqb-badge-icon-picker aqb-badge-icon-picker--inline"
          : "aqb-badge-icon-picker"
      }
    >
      {!inline ? (
        <p className="aqb-badge-icon-picker__hint">
          Optional. Icons appear on the left of your badge and leave room for
          your text on the right.
        </p>
      ) : null}
      <div
        className="aqb-badge-icon-picker__grid"
        role="listbox"
        aria-label="Badge icon"
      >
        <button
          type="button"
          role="option"
          aria-selected={noneSelected}
          className={`aqb-badge-icon-picker__cell ${
            noneSelected ? "is-selected" : ""
          }`}
          onClick={() => onChange(undefined)}
          title="No icon"
        >
          <span className="aqb-badge-icon-picker__none" aria-hidden>
            —
          </span>
          {!inline ? (
            <span className="aqb-badge-icon-picker__label">No icon</span>
          ) : null}
          {noneSelected ? (
            <span className="aqb-badge-icon-picker__check" aria-hidden>
              <CheckIcon className="h-2.5 w-2.5 stroke-[2.5]" />
            </span>
          ) : null}
        </button>
        {BADGE_ICON_IDS.map((id) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`aqb-badge-icon-picker__cell ${
                selected ? "is-selected" : ""
              }`}
              onClick={() => onChange(id)}
              title={BADGE_ICON_LABELS[id]}
            >
              <img
                src={badgeIconPublicSrc(id)}
                alt=""
                className="aqb-badge-icon-picker__img"
                draggable={false}
              />
              <span className="sr-only">{BADGE_ICON_LABELS[id]}</span>
              {selected ? (
                <span className="aqb-badge-icon-picker__check" aria-hidden>
                  <CheckIcon className="h-2.5 w-2.5 stroke-[2.5]" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
