import React from 'react';
import { Badge, BadgeLine } from '../types/badge';
import { BADGE_CONSTANTS } from '../constants/badge';
import { BadgeEditorPanel } from './BadgeEditorPanel';

interface BadgeEditPanelProps {
  badge: Badge;
  maxLines: number;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
  onAlignmentChange: (index: number, alignment: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onRemoveLine: (index: number) => void;
  addLine: () => void;
  showRemove?: boolean;
  editable?: boolean;
}

export const BadgeEditPanel: React.FC<BadgeEditPanelProps> = ({
  badge,
  maxLines,
  onLineChange,
  onAlignmentChange,
  onBackgroundColorChange,
  onRemoveLine,
  addLine,
  showRemove = true,
  editable = true,
}) => (
  <div className="w-full">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-800">Text Lines</h3>
      <button
        onClick={addLine}
        disabled={badge.lines.length >= maxLines || !editable}
        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        Add Line ({badge.lines.length}/{maxLines})
      </button>
    </div>
    <BadgeEditorPanel
      badge={badge}
      onLineChange={onLineChange}
      onAlignmentChange={onAlignmentChange}
      onBackgroundColorChange={onBackgroundColorChange}
      onRemoveLine={onRemoveLine}
      showRemove={showRemove}
      maxLines={maxLines}
      addLineButton={null}
      resetButton={null}
      multiBadgeButton={null}
      editable={editable}
    />
  </div>
); 