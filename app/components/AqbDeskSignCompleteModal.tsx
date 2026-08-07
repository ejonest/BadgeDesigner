import React from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export interface AqbDeskSignCompleteModalProps {
  priceLabel: string;
  onCheckout: () => void;
  onAddAnother: () => void;
  onBackToEditing: () => void;
  /** Editing a single cart line: hide "add another". */
  hideAddAnother?: boolean;
}

export const AqbDeskSignCompleteModal: React.FC<
  AqbDeskSignCompleteModalProps
> = ({
  priceLabel,
  onCheckout,
  onAddAnother,
  onBackToEditing,
  hideAddAnother = false,
}) => {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4"
      onClick={onBackToEditing}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aqb-desk-sign-complete-title"
    >
      <div
        className="aqb-backing-complete-modal bg-white rounded-lg shadow-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <h3
            id="aqb-desk-sign-complete-title"
            className="text-lg font-semibold text-[#02132B] pr-2"
          >
            Your desk sign is ready
          </h3>
          <button
            type="button"
            className="p-1.5 text-gray-500 hover:text-gray-700 rounded shrink-0"
            onClick={onBackToEditing}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="px-5 pb-5 text-sm leading-relaxed text-gray-700">
          Checkout now, add another desk sign, or keep editing this design.
        </p>
        <div className="aqb-backing-complete-modal__actions flex flex-col gap-2 border-t border-[rgba(2,19,43,0.08)] p-4">
          <button
            type="button"
            className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--primary"
            onClick={onCheckout}
          >
            Checkout / Add to cart
            {priceLabel && priceLabel !== "—" ? ` · ${priceLabel}` : ""}
          </button>
          {hideAddAnother ? null : (
            <button
              type="button"
              className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--accent"
              onClick={onAddAnother}
            >
              Add another desk sign
            </button>
          )}
          <button
            type="button"
            className="aqb-backing-complete-modal__btn aqb-backing-complete-modal__btn--secondary"
            onClick={onBackToEditing}
          >
            Back to editing
          </button>
        </div>
      </div>
    </div>
  );
};
