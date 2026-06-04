import React from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export type ResetDesignConfirmMode = "single" | "all";

export interface AqbResetDesignConfirmModalProps {
  mode: ResetDesignConfirmMode;
  labelProduct: string;
  labelProductPlural: string;
  onConfirm: () => void;
  onCancel: () => void;
  onDontShowAgain: () => void;
}

export const AqbResetDesignConfirmModal: React.FC<
  AqbResetDesignConfirmModalProps
> = ({
  mode,
  labelProduct,
  labelProductPlural,
  onConfirm,
  onCancel,
  onDontShowAgain,
}) => {
  const isAll = mode === "all";
  const title = isAll ? "Reset all designs?" : "Reset design?";
  const body = isAll
    ? `This will reset all ${labelProductPlural} in your design. Text, text settings, and background color will return to defaults for every ${labelProduct}. Your templates and other settings will be kept.`
    : `This will reset the current ${labelProduct}. Text, text settings, and background color will return to defaults. Your template and other settings will be kept.`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aqb-reset-design-confirm-title"
    >
      <div
        className="aqb-reset-design-confirm-modal bg-white rounded-lg shadow-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <h3
            id="aqb-reset-design-confirm-title"
            className="text-lg font-semibold text-[#0d1b2a]"
          >
            {title}
          </h3>
          <button
            type="button"
            className="p-1.5 text-gray-500 hover:text-gray-700 rounded"
            onClick={onCancel}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="px-5 pb-5 text-sm leading-relaxed text-gray-700">
          {body}
        </p>
        <div className="aqb-reset-design-confirm-modal__actions flex flex-col-reverse gap-2 border-t border-[rgba(13,27,42,0.08)] p-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            className="aqb-reset-design-confirm-modal__btn aqb-reset-design-confirm-modal__btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="aqb-reset-design-confirm-modal__btn aqb-reset-design-confirm-modal__btn--ghost"
            onClick={onDontShowAgain}
          >
            Don&apos;t show me again
          </button>
          <button
            type="button"
            className="aqb-reset-design-confirm-modal__btn aqb-reset-design-confirm-modal__btn--primary"
            onClick={onConfirm}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
