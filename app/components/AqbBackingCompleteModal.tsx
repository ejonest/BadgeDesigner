import React from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export interface AqbBackingCompleteModalProps {
  priceLabel: string;
  labelProductPlural: string;
  onCheckout: () => void;
  onAddMore: () => void;
  onBackToDesign: () => void;
}

export const AqbBackingCompleteModal: React.FC<
  AqbBackingCompleteModalProps
> = ({
  priceLabel,
  labelProductPlural,
  onCheckout,
  onAddMore,
  onBackToDesign,
}) => {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4"
      onClick={onBackToDesign}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aqb-backing-complete-title"
    >
      <div
        className="aqb-backing-complete-modal bg-white rounded-lg shadow-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <h3
            id="aqb-backing-complete-title"
            className="text-lg font-semibold text-[#02132B] pr-2"
          >
            Ready to checkout or want to add more{" "}
            {labelProductPlural}?
          </h3>
          <button
            type="button"
            className="p-1.5 text-gray-500 hover:text-gray-700 rounded shrink-0"
            onClick={onBackToDesign}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="px-5 pb-5 text-sm leading-relaxed text-gray-700">
          Your design is complete. Checkout now, add more from a list, or keep
          editing.
        </p>
        <div className="aqb-backing-complete-modal__actions flex flex-col gap-2 border-t border-[rgba(2,19,43,0.08)] p-4">
          <button
            type="button"
            className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--primary"
            onClick={onCheckout}
          >
            Checkout{priceLabel && priceLabel !== "—" ? ` · ${priceLabel}` : ""}
          </button>
          <button
            type="button"
            className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--accent"
            onClick={onAddMore}
          >
            Add more
          </button>
          <button
            type="button"
            className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--secondary"
            onClick={onBackToDesign}
          >
            Go back to design
          </button>
        </div>
      </div>
    </div>
  );
};
