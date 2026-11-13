import React, { useState } from "react";
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

const iconClass = "h-4 w-4 stroke-[1.75]";

interface ActionButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  duplicate?: boolean;
  highlight?: boolean;
  accent?: boolean;
  expanded?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  title,
  onClick,
  icon,
  disabled = false,
  danger = false,
  duplicate = false,
  highlight = false,
  accent = false,
  expanded,
}) => (
  <button
    type="button"
    className={`aqb-ta-btn aqb-design-actions__btn${
      danger ? " aqb-ta-btn--danger" : ""
    }${duplicate ? " aqb-ta-btn--duplicate" : ""}${
      highlight ? " aqb-ta-btn--highlight" : ""
    }${accent ? " aqb-ta-btn--accent" : ""}${
      expanded !== undefined ? " aqb-ta-btn--more" : ""
    }${expanded ? " is-expanded" : ""}`}
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    title={title}
    aria-label={label}
    aria-expanded={expanded}
  >
    <span className="aqb-ta-icon" aria-hidden>
      {icon}
    </span>
    <span className="aqb-ta-label aqb-ta-label--desktop">{label}</span>
  </button>
);

export interface AqbDesignActionsProps {
  labelProduct: string;
  labelProductPlural: string;
  hasBadges: boolean;
  showAddMultiple?: boolean;
  highlightViewAll?: boolean;
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

/** Compact design toolbar. Everyday actions stay visible; deletes and resets fold away. */
export const AqbDesignActions: React.FC<AqbDesignActionsProps> = ({
  labelProduct,
  labelProductPlural,
  hasBadges,
  showAddMultiple = true,
  highlightViewAll = false,
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
  applyFormatLabel = "Apply this design's formatting to every item",
  onHelp,
  onSave,
  onLoad,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="aqb-design-actions" role="toolbar" aria-label="Design tools">
      <div className="aqb-design-actions__row">
        <ActionButton
          label="Undo"
          title="Undo last change"
          onClick={onUndo}
          disabled={undoDisabled}
          icon={<ArrowUturnLeftIcon className={iconClass} />}
        />
        <ActionButton
          label="View all"
          title={`View all ${labelProductPlural}`}
          onClick={onViewAll}
          highlight={highlightViewAll}
          icon={<Squares2X2Icon className={iconClass} />}
        />
        {showAddMultiple ? (
          <ActionButton
            label="Add multiple"
            title={`Add multiple ${labelProductPlural} from a list or file`}
            onClick={onAddMultiple}
            accent
            icon={<AddMultipleGridIcon className={iconClass} />}
          />
        ) : null}
        <ActionButton
          label="Save"
          title="Save design"
          onClick={onSave}
          icon={<ArrowUpTrayIcon className={iconClass} />}
        />
        <ActionButton
          label={moreOpen ? "Less" : "More"}
          title={moreOpen ? "Hide more actions" : "Show delete, reset, and other actions"}
          onClick={() => setMoreOpen((open) => !open)}
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
          className="aqb-design-actions__more"
          role="group"
          aria-label="More design actions"
        >
          <ActionButton
            label="Load"
            title="Load a saved design"
            onClick={onLoad}
            icon={<FolderOpenIcon className={iconClass} />}
          />
          <ActionButton
            label="Help"
            title="Help — learn about the designer"
            onClick={onHelp}
            icon={<QuestionMarkCircleIcon className={iconClass} />}
          />
          {hasBadges ? (
            <ActionButton
              label="Duplicate"
              title={`Duplicate this ${labelProduct}`}
              onClick={onCopy}
              duplicate
              icon={<DocumentDuplicateIcon className={iconClass} />}
            />
          ) : null}
          {showApplyFormatToAll && onApplyFormatToAll ? (
            <ActionButton
              label="Apply to all"
              title={applyFormatLabel}
              onClick={onApplyFormatToAll}
              icon={<Square2StackIcon className={iconClass} />}
            />
          ) : null}
          <ActionButton
            label="Reset"
            title={`Reset this ${labelProduct} to the default settings`}
            onClick={onReset}
            icon={<ArrowPathIcon className={iconClass} />}
          />
          {showResetAll && onResetAll ? (
            <ActionButton
              label="Reset all"
              title={`Reset every ${labelProduct} to the default settings`}
              onClick={onResetAll}
              icon={<ArrowPathIcon className={iconClass} />}
            />
          ) : null}
          {hasBadges ? (
            <ActionButton
              label="Delete"
              title={`Delete this ${labelProduct}`}
              onClick={onDelete}
              danger
              icon={<TrashIcon className={iconClass} />}
            />
          ) : null}
          {hasBadges ? (
            <ActionButton
              label="Delete all"
              title={`Delete all ${labelProductPlural} from your design`}
              onClick={onDeleteAll}
              danger
              icon={<TrashIcon className={iconClass} />}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
