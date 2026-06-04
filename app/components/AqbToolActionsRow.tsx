import React from "react";
import {
  ArrowUpTrayIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  FolderOpenIcon,
  QuestionMarkCircleIcon,
  Square2StackIcon,
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
  onHelp: () => void;
  onSave: () => void;
  onLoad: () => void;
}

const iconClass = "h-[18px] w-[18px] stroke-[1.75] text-[#0d1b2a]";

/** 2×2 grid: 3 squares + plus in top-right (matches 4-grid, fourth cell is “add”). */
export const AddMultipleGridIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="7" rx="1.25" />
    <rect x="3" y="14" width="7" height="7" rx="1.25" />
    <rect x="14" y="14" width="7" height="7" rx="1.25" />
    <path d="M17.5 3.75v5.5M14.25 6.5h6.5" />
  </svg>
);

interface ToolButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  label,
  title,
  onClick,
  disabled = false,
  icon,
}) => (
  <button
    type="button"
    className="aqb-ta-btn"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    title={title}
  >
    <span className="aqb-ta-icon" aria-hidden>
      {icon}
    </span>
    <span className="aqb-ta-label">{label}</span>
  </button>
);

const ToolButtonRow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <div className="aqb-tool-actions-row__row">{children}</div>;

export const AqbToolActionsRow: React.FC<AqbToolActionsRowProps> = ({
  onUndo,
  undoDisabled = false,
  onReset,
  onResetAll,
  showResetAll = false,
  onApplyFormatToAll,
  showApplyFormatToAll = false,
  applyFormatLabel = "Apply to all",
  onHelp,
  onSave,
  onLoad,
}) => (
  <div
    className="aqb-tool-actions-row"
    role="toolbar"
    aria-label="Design tools"
  >
    <ToolButtonRow>
      <ToolButton
        label="Undo"
        title="Undo last change"
        onClick={onUndo}
        disabled={undoDisabled}
        icon={<ArrowUturnLeftIcon className={iconClass} />}
      />
      <ToolButton
        label="Reset Design"
        title="Reset current badge to default settings"
        onClick={onReset}
        icon={<ArrowPathIcon className={iconClass} />}
      />
      {showResetAll && onResetAll ? (
        <ToolButton
          label="Reset All Designs"
          title="Reset all badges to default settings"
          onClick={onResetAll}
          icon={<ArrowPathIcon className={iconClass} />}
        />
      ) : null}
      {showApplyFormatToAll && onApplyFormatToAll ? (
        <ToolButton
          label="Apply all"
          title={applyFormatLabel}
          onClick={onApplyFormatToAll}
          icon={<Square2StackIcon className={iconClass} />}
        />
      ) : null}
    </ToolButtonRow>
    <ToolButtonRow>
      <ToolButton
        label="Help Center"
        title="Help — learn about the designer"
        onClick={onHelp}
        icon={<QuestionMarkCircleIcon className={iconClass} />}
      />
      <ToolButton
        label="Save Design"
        title="Save design"
        onClick={onSave}
        icon={<ArrowUpTrayIcon className={iconClass} />}
      />
      <ToolButton
        label="Load Design"
        title="Load a saved design"
        onClick={onLoad}
        icon={<FolderOpenIcon className={iconClass} />}
      />
    </ToolButtonRow>
  </div>
);
