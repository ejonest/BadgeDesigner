import React, { useEffect, useState } from "react";
import { clampBadgeLineQty } from "../utils/badgeLineQuantities";

export interface BadgeQtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Compact layout for grid cards */
  compact?: boolean;
  ariaLabel?: string;
  min?: number;
}

export function BadgeQtyStepper({
  value,
  onChange,
  disabled = false,
  compact = false,
  ariaLabel = "Quantity",
  min = 1,
}: BadgeQtyStepperProps) {
  const clamped = clampBadgeLineQty(value);
  const [text, setText] = useState(String(clamped));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(clamped));
  }, [clamped, focused]);

  const btnClass = compact
    ? "flex h-7 w-7 items-center justify-center rounded border border-[rgba(13,27,42,0.15)] bg-white text-[#0d1b2a] hover:bg-[#f5f2ee] disabled:opacity-40 text-sm"
    : "flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40";

  const inputClass = compact
    ? "w-9 text-center text-xs font-semibold tabular-nums border border-[rgba(13,27,42,0.15)] rounded bg-white text-[#0d1b2a] py-0.5"
    : "w-10 text-center text-sm font-semibold tabular-nums border border-gray-300 rounded-md bg-white py-1";

  return (
    <div
      className={`inline-flex items-center gap-1 ${compact ? "" : "rounded-lg border border-gray-200 bg-white px-1 py-0.5"}`}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={btnClass}
        disabled={disabled || clamped <= min}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(clampBadgeLineQty(clamped - 1))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        className={inputClass}
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
          setFocused(false);
          const v = parseInt(text, 10);
          if (Number.isNaN(v)) {
            onChange(min);
          } else {
            onChange(clampBadgeLineQty(Math.max(min, v)));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className={btnClass}
        disabled={disabled}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(clampBadgeLineQty(clamped + 1))}
      >
        +
      </button>
    </div>
  );
}
