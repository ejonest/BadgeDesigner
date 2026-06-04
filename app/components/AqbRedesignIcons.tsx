import React from "react";
import {
  ArrowPathIcon,
  MapPinIcon,
  PencilSquareIcon,
  Square2StackIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import type { BadgeBackingKey } from "../constants/badgeAqbBacking";

/** Trust strip / order panel icons (18px). */
export const AQB_UI_ICON_SM = "h-[18px] w-[18px] shrink-0 stroke-[1.75] text-[#3a4f63]";

/** Backing info card icons (20px). */
export const AQB_UI_ICON_MD = "h-5 w-5 shrink-0 stroke-[1.75] text-[#3a4f63]";

/** Filled US flag — avoids Windows “US” regional indicator rendering. */
export const UsFlagIcon: React.FC<{ className?: string }> = ({
  className = "h-[18px] w-[18px] shrink-0",
}) => (
  <svg
    className={className}
    viewBox="0 0 21 15"
    aria-hidden="true"
    role="img"
  >
    {Array.from({ length: 13 }, (_, i) => (
      <rect
        key={i}
        x="0"
        y={(15 / 13) * i}
        width="21"
        height={15 / 13}
        fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"}
      />
    ))}
    <rect x="0" y="0" width="8.4" height="8.08" fill="#3C3B6E" />
    {[
      [1.4, 1.2],
      [3.2, 1.2],
      [5.0, 1.2],
      [6.8, 1.2],
      [2.3, 2.5],
      [4.1, 2.5],
      [5.9, 2.5],
      [1.4, 3.8],
      [3.2, 3.8],
      [5.0, 3.8],
      [6.8, 3.8],
      [2.3, 5.1],
      [4.1, 5.1],
      [5.9, 5.1],
      [3.2, 6.4],
      [5.0, 6.4],
    ].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="0.42" fill="#FFFFFF" />
    ))}
  </svg>
);

const MagnetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 4v6a4 4 0 0 0 8 0V4" />
    <path d="M8 4H5a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h3" />
    <path d="M16 4h3a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-3" />
  </svg>
);

export const AqbTruckIcon: React.FC<{ className?: string }> = ({
  className = AQB_UI_ICON_SM,
}) => <TruckIcon className={className} aria-hidden="true" />;

export const AqbPencilIcon: React.FC<{ className?: string }> = ({
  className = AQB_UI_ICON_SM,
}) => <PencilSquareIcon className={className} aria-hidden="true" />;

export const AqbRepeatIcon: React.FC<{ className?: string }> = ({
  className = AQB_UI_ICON_SM,
}) => <ArrowPathIcon className={className} aria-hidden="true" />;

export const AqbBackingIcon: React.FC<{
  backing: BadgeBackingKey;
  className?: string;
}> = ({ backing, className = AQB_UI_ICON_MD }) => {
  switch (backing) {
    case "magnetic":
      return <MagnetIcon className={className} />;
    case "pin":
      return <MapPinIcon className={className} aria-hidden="true" />;
    case "adhesive":
      return <Square2StackIcon className={className} aria-hidden="true" />;
  }
};
