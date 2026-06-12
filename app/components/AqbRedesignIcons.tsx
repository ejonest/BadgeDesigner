import React from "react";

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
