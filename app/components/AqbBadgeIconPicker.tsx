import React, { useEffect, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import {
  BADGE_ICON_IDS,
  type BadgeIconId,
  badgeIconPublicSrc,
  BADGE_ICON_LABELS,
  isBadgeIconId,
} from "../constants/badgeIcons";

/** `null` = no choice yet; `"none"` = explicit no icon; otherwise an icon id. */
export type AqbBadgeIconPickerValue = BadgeIconId | "none" | null;

interface AqbBadgeIconPickerProps {
  value: AqbBadgeIconPickerValue;
  /** Live preview while choosing (does not complete the step). */
  onChange: (value: BadgeIconId | "none") => void;
  /** Commit the choice and advance — used by the gated Continue button. */
  onContinue?: (value: BadgeIconId | "none") => void;
  /** Compact grid for legacy layouts. Prefer `gated` for the icon step. */
  variant?: "default" | "inline" | "gated";
}

export const AqbBadgeIconPicker: React.FC<AqbBadgeIconPickerProps> = ({
  value,
  onChange,
  onContinue,
  variant = "gated",
}) => {
  const [wantsIcon, setWantsIcon] = useState(() => isBadgeIconId(value));

  useEffect(() => {
    if (isBadgeIconId(value)) setWantsIcon(true);
    else if (value === "none") setWantsIcon(false);
  }, [value]);

  if (variant === "gated") {
    const selectedIcon = isBadgeIconId(value) ? value : null;
    const canContinue = !wantsIcon || selectedIcon != null;

    const chooseNo = () => {
      setWantsIcon(false);
      onChange("none");
    };

    const chooseYes = () => {
      setWantsIcon(true);
    };

    const handleContinue = () => {
      if (!canContinue || !onContinue) return;
      onContinue(wantsIcon && selectedIcon ? selectedIcon : "none");
    };

    return (
      <div className="aqb-badge-icon-gate">
        <p className="aqb-badge-icon-gate__question">
          Add an icon to this badge?
        </p>

        <div
          className="aqb-badge-icon-gate__toggle"
          role="group"
          aria-label="Add an icon to this badge?"
        >
          <button
            type="button"
            className={`aqb-badge-icon-gate__toggle-btn${!wantsIcon ? " is-active" : ""}`}
            aria-pressed={!wantsIcon}
            onClick={chooseNo}
          >
            No
          </button>
          <button
            type="button"
            className={`aqb-badge-icon-gate__toggle-btn${wantsIcon ? " is-active" : ""}`}
            aria-pressed={wantsIcon}
            onClick={chooseYes}
          >
            Yes
          </button>
        </div>

        {wantsIcon ? (
          <div className="aqb-badge-icon-gate__chooser">
            <div className="aqb-badge-finish-lbl">Please choose an icon</div>
            <div
              className="aqb-badge-icon-picker__grid aqb-badge-icon-picker__grid--gated"
              role="listbox"
              aria-label="Badge icon"
            >
              {BADGE_ICON_IDS.map((id) => {
                const selected = selectedIcon === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`aqb-badge-icon-picker__cell${selected ? " is-selected" : ""}`}
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
        ) : (
          <p className="aqb-badge-icon-gate__hint">
            Grid stays hidden while &lsquo;No&rsquo; is selected — nothing to
            second-guess, most orders can move straight on.
          </p>
        )}

        {onContinue ? (
          <button
            type="button"
            className="aqb-badge-icon-gate__continue"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Continue →
          </button>
        ) : null}
      </div>
    );
  }

  const noneSelected = value === "none";
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
          onClick={() => onChange("none")}
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
