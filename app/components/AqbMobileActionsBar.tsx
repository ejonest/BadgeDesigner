import React from "react";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
  FolderOpenIcon,
  QuestionMarkCircleIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AddMultipleGridIcon } from "./AqbToolActionsRow";

const iconClass = "h-[18px] w-[18px] stroke-[1.75] text-current";

export interface AqbMobileActionsBarProps {
  labelProduct: string;
  labelProductPlural: string;
  hasBadges: boolean;
  showAddMultiple?: boolean;
  highlightViewAll?: boolean;
  /**
   * The design is locked to a single item (editing one cart line), so hide the
   * actions that change how many designs there are. Undo/reset/save/help stay.
   */
  singleDesignMode?: boolean;
  onViewAll: () => void;
  onAddMultiple: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDeleteAll: () => void;
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

type BarButtonProps = {
  label: string;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  duplicate?: boolean;
  highlight?: boolean;
  accent?: boolean;
  more?: boolean;
  expanded?: boolean;
};

const BarButton: React.FC<BarButtonProps> = ({
  label,
  title,
  onClick,
  icon,
  disabled = false,
  danger = false,
  duplicate = false,
  highlight = false,
  accent = false,
  more = false,
  expanded = false,
}) => (
  <button
    type="button"
    className={`aqb-ta-btn${danger ? " aqb-ta-btn--danger" : ""}${
      duplicate ? " aqb-ta-btn--duplicate" : ""
    }${highlight ? " aqb-ta-btn--highlight" : ""}${
      accent ? " aqb-ta-btn--accent" : ""
    }${more ? " aqb-ta-btn--more" : ""}${
      more && expanded ? " is-expanded" : ""
    }`}
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    title={title}
    aria-label={label}
    aria-expanded={more ? expanded : undefined}
  >
    <span className="aqb-ta-icon" aria-hidden>
      {icon}
    </span>
    <span className="aqb-ta-label aqb-ta-label--mobile">{label}</span>
  </button>
);

/**
 * Mobile-only compact toolbar:
 * Row 1 — View All | Add Multiple
 * Row 2 — Save | Load | More (expands secondary actions)
 */
export const AqbMobileActionsBar: React.FC<AqbMobileActionsBarProps> = ({
  labelProduct,
  labelProductPlural,
  hasBadges,
  showAddMultiple = true,
  highlightViewAll = false,
  singleDesignMode = false,
  onViewAll,
  onAddMultiple,
  onCopy,
  onDelete,
  onDeleteAll,
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
}) => {
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <div
      className="aqb-mobile-actions-bar"
      role="toolbar"
      aria-label="Design tools"
    >
      {singleDesignMode ? null : (
        <div className="aqb-tool-actions-row__row">
          <BarButton
            label="View All"
            title={`View all ${labelProductPlural}`}
            onClick={onViewAll}
            highlight={highlightViewAll}
            icon={<Squares2X2Icon className={iconClass} />}
          />
          {showAddMultiple ? (
            <BarButton
              label="Add Multiple"
              title={`Add multiple ${labelProductPlural} from CSV file or data`}
              onClick={onAddMultiple}
              accent
              icon={<AddMultipleGridIcon className={iconClass} />}
            />
          ) : null}
        </div>
      )}

      <div className="aqb-tool-actions-row__row">
        <BarButton
          label="Save"
          title="Save design"
          onClick={onSave}
          icon={<ArrowUpTrayIcon className={iconClass} />}
        />
        <BarButton
          label="Load"
          title="Load a saved design"
          onClick={onLoad}
          icon={<FolderOpenIcon className={iconClass} />}
        />
        <BarButton
          label={moreOpen ? "Less" : "More"}
          title={moreOpen ? "Hide more actions" : "Show more actions"}
          onClick={() => setMoreOpen((open) => !open)}
          more
          expanded={moreOpen}
          icon={
            moreOpen ? (
              <ChevronUpIcon className={iconClass} />
            ) : (
              <ChevronDownIcon className={iconClass} />
            )
          }
        />
      </div>

      {moreOpen ? (
        <div
          className="aqb-mobile-actions-bar__more"
          role="group"
          aria-label="More design actions"
        >
          {hasBadges && !singleDesignMode ? (
            <div className="aqb-tool-actions-row__row">
              <BarButton
                label="Copy"
                title={`Duplicate this ${labelProduct}`}
                onClick={onCopy}
                duplicate
                icon={<DocumentDuplicateIcon className={iconClass} />}
              />
              <BarButton
                label="Delete"
                title={`Delete this ${labelProduct}`}
                onClick={onDelete}
                danger
                icon={<TrashIcon className={iconClass} />}
              />
              <BarButton
                label="Delete All"
                title={`Delete all ${labelProductPlural} from your design`}
                onClick={onDeleteAll}
                danger
                icon={<TrashIcon className={iconClass} />}
              />
            </div>
          ) : null}
          <div className="aqb-tool-actions-row__row">
            <BarButton
              label="Undo"
              title="Undo last change"
              onClick={onUndo}
              disabled={undoDisabled}
              icon={<ArrowUturnLeftIcon className={iconClass} />}
            />
            <BarButton
              label="Reset"
              title="Reset current badge to default settings"
              onClick={onReset}
              icon={<ArrowPathIcon className={iconClass} />}
            />
            {showResetAll && onResetAll ? (
              <BarButton
                label="Reset All"
                title="Reset all badges to default settings"
                onClick={onResetAll}
                icon={<ArrowPathIcon className={iconClass} />}
              />
            ) : null}
          </div>
          <div className="aqb-tool-actions-row__row">
            {showApplyFormatToAll && onApplyFormatToAll ? (
              <BarButton
                label="Apply"
                title={applyFormatLabel}
                onClick={onApplyFormatToAll}
                icon={<Square2StackIcon className={iconClass} />}
              />
            ) : null}
            <BarButton
              label="Help"
              title="Help — learn about the designer"
              onClick={onHelp}
              icon={<QuestionMarkCircleIcon className={iconClass} />}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
