import React from "react";

export type FontFamilyOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: FontFamilyOption[];
  onChange: (fontFamily: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** AQB redesign control styling vs legacy bordered select. */
  variant?: "aqb" | "legacy";
};

/**
 * Font family picker that renders each option in its own typeface.
 * Custom listbox (not a native select) so previews work on Chrome/Android.
 */
export const FontFamilySelect: React.FC<Props> = ({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  variant = "aqb",
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  const selected =
    options.find((opt) => opt.value === value) ??
    (value
      ? { value, label: value }
      : options[0] ?? { value: "Roboto", label: "Roboto" });

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

  const isAqb = variant === "aqb";

  return (
    <div
      ref={rootRef}
      className={
        isAqb
          ? `aqb-badge-font-select-wrap${open ? " is-open" : ""}${
              disabled ? " is-disabled" : ""
            }`
          : `relative inline-block min-w-0 max-w-full${
              disabled ? " opacity-60" : ""
            }`
      }
    >
      <button
        type="button"
        className={
          isAqb
            ? "aqb-badge-trc-select aqb-badge-font-select-trigger"
            : "border rounded px-2 py-1 text-sm bg-white text-left min-w-[9.5rem] max-w-full pr-7 relative"
        }
        style={{ fontFamily: `"${selected.value}", sans-serif` }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        {selected.label}
        {!isAqb ? (
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]"
            aria-hidden
          >
            ▼
          </span>
        ) : null}
      </button>
      {open && !disabled ? (
        <ul
          className={
            isAqb
              ? "aqb-badge-font-select-menu"
              : "absolute z-30 top-[calc(100%+4px)] left-0 min-w-full max-h-56 overflow-y-auto m-0 p-1 list-none border border-gray-300 rounded bg-white shadow-lg"
          }
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((font) => {
            const isSelected = font.value === selected.value;
            return (
              <li key={font.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={
                    isAqb
                      ? `aqb-badge-font-select-option${
                          isSelected ? " selected" : ""
                        }`
                      : `block w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-gray-100${
                          isSelected ? " bg-blue-50 font-semibold" : ""
                        }`
                  }
                  style={{ fontFamily: `"${font.value}", sans-serif` }}
                  onClick={() => {
                    onChange(font.value);
                    setOpen(false);
                  }}
                >
                  {font.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
