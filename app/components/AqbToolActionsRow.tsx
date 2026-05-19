import React from "react";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  QuestionMarkCircleIcon,
  Square2StackIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

export interface AqbToolActionsRowProps {
  onUndo: () => void;
  undoDisabled?: boolean;
  onReset: () => void;
  onResetAll?: () => void;
  showResetAll?: boolean;
  onApplyFormatToAll?: () => void;
  showApplyFormatToAll?: boolean;
  applyFormatLabel?: string;
  onAddMultiple: () => void;
  onHelp: () => void;
  onSave: () => void;
  onLoad: () => void;
}

const iconClass = "h-[18px] w-[18px] stroke-[1.75] text-[#0d1b2a]";

export const AqbToolActionsRow: React.FC<AqbToolActionsRowProps> = ({
  onUndo,
  undoDisabled = false,
  onReset,
  onResetAll,
  showResetAll = false,
  onApplyFormatToAll,
  showApplyFormatToAll = false,
  applyFormatLabel = "Apply to all",
  onAddMultiple,
  onHelp,
  onSave,
  onLoad,
}) => (
  <div className="aqb-tool-actions-row" role="toolbar" aria-label="Design tools">
    <button
      type="button"
      className="aqb-ta-btn"
      onClick={(e) => {
        e.preventDefault();
        onUndo();
      }}
      disabled={undoDisabled}
      title="Undo last change"
    >
      <span className="aqb-ta-icon" aria-hidden>
        <ArrowUturnLeftIcon className={iconClass} />
      </span>
      <span className="aqb-ta-label">Undo</span>
    </button>

    <button
      type="button"
      className="aqb-ta-btn"
      onClick={(e) => {
        e.preventDefault();
        onReset();
      }}
      title="Reset current badge to default settings"
    >
      <span className="aqb-ta-icon" aria-hidden>
        <ArrowPathIcon className={iconClass} />
      </span>
      <span className="aqb-ta-label">Reset</span>
    </button>

    {showResetAll && onResetAll ? (
      <button
        type="button"
        className="aqb-ta-btn"
        onClick={(e) => {
          e.preventDefault();
          onResetAll();
        }}
        title="Reset all badges to default settings"
      >
        <span className="aqb-ta-icon" aria-hidden>
          <ArrowPathIcon className={iconClass} />
        </span>
        <span className="aqb-ta-label">Reset all</span>
      </button>
    ) : null}

    {showApplyFormatToAll && onApplyFormatToAll ? (
      <button
        type="button"
        className="aqb-ta-btn"
        onClick={(e) => {
          e.preventDefault();
          onApplyFormatToAll();
        }}
        title={applyFormatLabel}
      >
        <span className="aqb-ta-icon" aria-hidden>
          <Square2StackIcon className={iconClass} />
        </span>
        <span className="aqb-ta-label">Apply all</span>
      </button>
    ) : null}

    <button
      type="button"
      className="aqb-ta-btn"
      onClick={(e) => {
        e.preventDefault();
        onAddMultiple();
      }}
      title="Add multiple badges from CSV"
    >
      <span className="aqb-ta-icon" aria-hidden>
        <Squares2X2Icon className={iconClass} />
      </span>
      <span className="aqb-ta-label">Add Multiple</span>
    </button>

    <button
      type="button"
      className="aqb-ta-btn"
      onClick={(e) => {
        e.preventDefault();
        onHelp();
      }}
      title="Help — learn about the designer"
    >
      <span className="aqb-ta-icon" aria-hidden>
        <QuestionMarkCircleIcon className={iconClass} />
      </span>
      <span className="aqb-ta-label">Help Centre</span>
    </button>

    <button
      type="button"
      className="aqb-ta-btn aqb-ta-btn--save"
      onClick={(e) => {
        e.preventDefault();
        onSave();
      }}
      title="Save design"
    >
      <span className="aqb-ta-icon aqb-ta-icon--emoji" aria-hidden>
        ⭐
      </span>
      <span className="aqb-ta-label">Save Design</span>
    </button>

    <button
      type="button"
      className="aqb-ta-btn"
      onClick={(e) => {
        e.preventDefault();
        onLoad();
      }}
      title="Load a saved design"
    >
      <span className="aqb-ta-icon aqb-ta-icon--emoji" aria-hidden>
        📂
      </span>
      <span className="aqb-ta-label">Load Design</span>
    </button>
  </div>
);
