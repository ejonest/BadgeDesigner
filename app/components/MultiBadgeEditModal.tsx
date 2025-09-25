import React from 'react';
import { Badge } from '../types/badge';
import { BADGE_CONSTANTS } from '../constants/badge';
import BadgeSvgRenderer from './BadgeSvgRenderer';
import { BadgeEditorPanel } from './BadgeEditorPanel';

interface MultiBadgeEditModalProps {
  badges: Badge[];
  onBadgesChange: (badges: Badge[]) => void;
  onClose: () => void;
}

export const MultiBadgeEditModal: React.FC<MultiBadgeEditModalProps> = ({
  badges,
  onBadgesChange,
  onClose
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Edit Multiple Badges</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-8">
            {badges.map((badge, index) => (
              <div key={index} className="border rounded-lg p-6 bg-gray-50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-gray-800">Badge {index + 1}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">Text Lines</h3>
                      <button
                        onClick={() => {
                          const newBadges = [...badges];
                          if (newBadges[index].lines.length < BADGE_CONSTANTS.MAX_LINES) {
                            newBadges[index] = {
                              ...newBadges[index],
                              lines: [...newBadges[index].lines, { ...BADGE_CONSTANTS.DEFAULT_LINE }]
                            };
                            onBadgesChange(newBadges);
                          }
                        }}
                        disabled={badge.lines.length >= BADGE_CONSTANTS.MAX_LINES}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Add Line ({badge.lines.length}/{BADGE_CONSTANTS.MAX_LINES})
                      </button>
                    </div>
                    <BadgeEditorPanel
                      badge={badge}
                      onLineChange={(lineIndex, changes) => {
                        const newBadges = [...badges];
                        const newLines = [...badge.lines];
                        newLines[lineIndex] = { ...newLines[lineIndex], ...changes };
                        newBadges[index] = { ...badge, lines: newLines };
                        onBadgesChange(newBadges);
                      }}
                      onAlignmentChange={(lineIndex, alignment) => {
                        const newBadges = [...badges];
                        newBadges[index] = {
                          ...badge,
                          lines: badge.lines.map((l, i) => i === lineIndex ? { ...l, alignment: alignment as 'left' | 'center' | 'right' } : l)
                        };
                        onBadgesChange(newBadges);
                      }}
                      onBackgroundColorChange={(backgroundColor) => {
                        const newBadges = [...badges];
                        newBadges[index] = { ...badge, backgroundColor };
                        onBadgesChange(newBadges);
                      }}
                      onRemoveLine={(lineIndex) => {
                        const newBadges = [...badges];
                        const newLines = [...badge.lines];
                        newLines.splice(lineIndex, 1);
                        newBadges[index] = { ...badge, lines: newLines };
                        onBadgesChange(newBadges);
                      }}
                      showRemove={true}
                      maxLines={BADGE_CONSTANTS.MAX_LINES}
                      addLineButton={null}
                      resetButton={null}
                      multiBadgeButton={null}
                      editable={true}
                    />
                  </div>

                  <div className="flex items-center justify-center">
                    <BadgeSvgRenderer badge={badge} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};