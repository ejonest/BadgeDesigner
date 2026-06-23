import React from "react";
import {
  DocumentDuplicateIcon,
  Squares2X2Icon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AddMultipleGridIcon } from "./AqbToolActionsRow";

const iconClass = "h-[18px] w-[18px] stroke-[1.75] text-[#0d1b2a]";

interface PreviewActionButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  duplicate?: boolean;
  /** Short label beside icon on mobile */
  mobileLabel?: string;
}

const PreviewActionButton: React.FC<PreviewActionButtonProps> = ({
  label,
  title,
  onClick,
  icon,
  danger = false,
  duplicate = false,
  mobileLabel,
}) => (
  <button
    type="button"
    className={`aqb-ta-btn${
      mobileLabel ? " aqb-ta-btn--mobile-inline" : " aqb-ta-btn--icon-only"
    }${
      danger ? " aqb-ta-btn--danger" : duplicate ? " aqb-ta-btn--duplicate" : ""
    }`}
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    title={title}
    aria-label={label}
  >
    <span className="aqb-ta-icon" aria-hidden>
      {icon}
    </span>
    {mobileLabel ? (
      <span className="aqb-ta-label aqb-ta-label--mobile">{mobileLabel}</span>
    ) : null}
  </button>
);

const PreviewActionRow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <div className="aqb-tool-actions-row__row">{children}</div>;

export interface AqbPreviewPanelHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  centered?: boolean;
}

export const AqbPreviewPanelHeader: React.FC<AqbPreviewPanelHeaderProps> = ({
  title,
  subtitle,
  extra,
  centered = false,
}) => (
  <div
    className={`aqb-preview-panel-header${
      centered ? " aqb-preview-panel-header--centered" : ""
    }`}
  >
    <div className="aqb-preview-panel-header__text">
      <h3 className="aqb-preview-panel-header__title">{title}</h3>
      {subtitle ? (
        <p className="aqb-preview-panel-header__subtitle">{subtitle}</p>
      ) : null}
    </div>
    {extra ? (
      <div className="aqb-preview-panel-header__extra">{extra}</div>
    ) : null}
  </div>
);

export interface AqbPreviewActionsRowProps {
  labelProduct: string;
  labelProductPlural: string;
  hasBadges: boolean;
  showAddMultiple?: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onDeleteAll: () => void;
  onViewAll: () => void;
  onAddMultiple: () => void;
}

export const AqbPreviewActionsRow: React.FC<AqbPreviewActionsRowProps> = ({
  labelProduct,
  labelProductPlural,
  hasBadges,
  showAddMultiple = true,
  onCopy,
  onDelete,
  onDeleteAll,
  onViewAll,
  onAddMultiple,
}) => (
  <div
    className="aqb-preview-actions-row"
    role="toolbar"
    aria-label="Preview actions"
  >
    {hasBadges ? (
      <PreviewActionRow>
        <PreviewActionButton
          label="Duplicate"
          mobileLabel="Copy"
          title={`Duplicate this ${labelProduct}`}
          onClick={onCopy}
          duplicate
          icon={<DocumentDuplicateIcon className={`${iconClass} text-current`} />}
        />
        <PreviewActionButton
          label="Delete"
          mobileLabel="Delete"
          title={`Delete this ${labelProduct}`}
          onClick={onDelete}
          danger
          icon={<TrashIcon className={`${iconClass} text-current`} />}
        />
        <PreviewActionButton
          label="Delete all"
          mobileLabel="Delete All"
          title={`Delete all ${labelProductPlural} from your design`}
          onClick={onDeleteAll}
          danger
          icon={<TrashIcon className={`${iconClass} text-current`} />}
        />
      </PreviewActionRow>
    ) : null}
    <PreviewActionRow>
      <PreviewActionButton
        label="View all"
        mobileLabel="View All"
        title={`View all ${labelProductPlural}`}
        onClick={onViewAll}
        icon={<Squares2X2Icon className={iconClass} />}
      />
      {showAddMultiple ? (
        <PreviewActionButton
          label="Add multiple"
          mobileLabel="Add"
          title={`Add multiple ${labelProductPlural} from CSV file or data`}
          onClick={onAddMultiple}
          icon={<AddMultipleGridIcon className={iconClass} />}
        />
      ) : null}
    </PreviewActionRow>
  </div>
);
