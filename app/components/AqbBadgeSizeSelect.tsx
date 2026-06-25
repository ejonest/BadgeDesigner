import React from "react";
import {
  AQB_PRESET_TOO_LARGE_TOOLTIP,
  type AqbBadgeSizeLabel,
} from "~/utils/aqbBadgeTextSize";

type SizeOption = {
  label: AqbBadgeSizeLabel;
  available: boolean;
};

type Props = {
  value: AqbBadgeSizeLabel;
  options: SizeOption[];
  onChange: (label: AqbBadgeSizeLabel) => void;
  disabled?: boolean;
  ariaLabel: string;
};

export const AqbBadgeSizeSelect: React.FC<Props> = ({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`aqb-badge-size-select-wrap${open ? " is-open" : ""}${
        disabled ? " is-disabled" : ""
      }`}
    >
      <button
        type="button"
        className="aqb-badge-trc-select aqb-badge-size-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        {value}
      </button>
      {open && !disabled ? (
        <ul className="aqb-badge-size-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(({ label, available }) => {
            const selected = value === label;
            return (
              <li key={label} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`aqb-badge-size-select-option${
                    selected ? " selected" : ""
                  }${!available ? " unavailable" : ""}`}
                  disabled={!available}
                  title={
                    !available ? AQB_PRESET_TOO_LARGE_TOOLTIP : undefined
                  }
                  onClick={() => {
                    if (!available) return;
                    onChange(label);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
