import React from 'react';

interface BadgeTextLinesHeaderProps {
  numLines: number;
  maxLines: number;
  onAddLine: () => void;
}

export const BadgeTextLinesHeader: React.FC<BadgeTextLinesHeaderProps> = ({
  numLines,
  maxLines,
  onAddLine,
}) => (
  <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-lg shadow-sm">
    <span className="font-semibold text-gray-700">Text Lines</span>
    <button
      className="control-button bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 px-4 py-2 text-sm rounded shadow-sm z-10 relative"
      style={{ minWidth: 160, maxWidth: 200 }}
      onClick={onAddLine}
      disabled={numLines >= maxLines}
    >
      Add (up to {maxLines} Lines)
    </button>
  </div>
); 