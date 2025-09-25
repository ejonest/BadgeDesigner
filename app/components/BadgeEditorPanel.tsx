import React from 'react';
import { Badge, BadgeLine } from '../types/badge';
import { BADGE_CONSTANTS } from '../constants/badge';
import { BadgeLineEditor } from './BadgeLineEditor';
import BadgeSvgRenderer from './BadgeSvgRenderer';
import { autoScaleFontSize } from '../utils/textMeasurement';
import { FONT_COLORS } from '../constants/colors';
import { FONT_FAMILIES } from '../constants/fonts';
import { loadTemplateById } from '../utils/templates';

// Helper functions for normalized font size conversion
function sizeNormToPx(sizeNorm: number, designBoxHeight: number): number {
  return Math.round(sizeNorm * designBoxHeight);
}

function sizePxToNorm(sizePx: number, designBoxHeight: number): number {
  return Math.max(0.05, Math.min(0.5, sizePx / designBoxHeight));
}

function getMinMaxSizeNorm(designBoxHeight: number): { min: number; max: number } {
  return {
    min: sizePxToNorm(BADGE_CONSTANTS.MIN_FONT_SIZE, designBoxHeight),
    max: sizePxToNorm(BADGE_CONSTANTS.MAX_FONT_SIZE, designBoxHeight)
  };
}

export interface BadgeEditorPanelProps {
  badge: Badge;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
  onAlignmentChange: (index: number, alignment: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onRemoveLine: (index: number) => void;
  showRemove: boolean;
  maxLines: number;
  addLineButton: React.ReactNode;
  resetButton: React.ReactNode;
  multiBadgeButton: React.ReactNode;
  editable?: boolean;
}

export const BadgeEditorPanel: React.FC<BadgeEditorPanelProps> = ({
  badge,
  onLineChange,
  onAlignmentChange,
  onBackgroundColorChange,
  onRemoveLine,
  showRemove,
  maxLines,
  addLineButton,
  resetButton,
  multiBadgeButton,
  editable = true,
}) => {
  // Get the current template's designBox for font size calculations
  const [designBox, setDesignBox] = React.useState({ x: 0, y: 0, width: 288, height: 96 });
  
  React.useEffect(() => {
    if (badge.templateId) {
      loadTemplateById(badge.templateId).then(template => {
        setDesignBox(template.designBox);
      });
    }
  }, [badge.templateId]);

  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const align = justifyMap[badge.lines[0].alignment as 'left' | 'center' | 'right'];
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      {/* Line formatting boxes */}
      <div className="flex flex-col gap-4">
        {badge.lines.map((line: BadgeLine, idx: number) => (
          <div key={idx} className="rounded-lg p-4 flex flex-col gap-2 relative w-full min-w-0" style={{ backgroundColor: '#d5e0f1' }}>
            <div className="flex w-full items-center gap-4 mb-1">
              <label className="font-semibold text-sm">Line {idx + 1} Text</label>
              <div className="flex gap-2 items-center">
                <span className="font-semibold text-sm mr-1">Color:</span>
                {FONT_COLORS.map((fc) => {
                  const isDisabled = fc.value === badge.backgroundColor;
                  return (
                    <span key={fc.value} className="relative inline-block">
                      <button
                        className={`color-button w-5 h-5 lg:w-6 lg:h-6 ${line.color === fc.value ? 'ring-2 ring-offset-2 ' + fc.ring : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{ backgroundColor: fc.value }}
                        onClick={() => onLineChange(idx, { color: fc.value })}
                        disabled={isDisabled || !editable}
                        title={isDisabled ? 'Cannot match background' : fc.name}
                      />
                      {isDisabled && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 20 20" className="lg:w-5 lg:h-5"><line x1="3" y1="17" x2="17" y2="3" stroke="#b91c1c" strokeWidth="2.5" /></svg>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
            <input
              type="text"
              className="border rounded px-3 py-2 text-base w-full min-w-[120px]"
              style={{ backgroundColor: '#fff' }}
              value={line.text}
              onChange={e => onLineChange(idx, { text: e.target.value })}
              placeholder={`Line ${idx + 1}`}
              disabled={!editable}
            />
            <div className="flex flex-col sm:flex-row gap-2 items-center mt-2 min-w-0">
              <div className="flex flex-wrap gap-2 items-center min-w-0 w-full">
                {/* Font */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Font:</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={line.fontFamily}
                    onChange={e => onLineChange(idx, { fontFamily: e.target.value })}
                    disabled={!editable}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Format */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Format:</span>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center ${line.bold ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onLineChange(idx, { bold: !line.bold })}
                    title="Bold"
                    disabled={!editable}
                  >
                    <span className="font-bold text-lg">B</span>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center ${line.italic ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onLineChange(idx, { italic: !line.italic })}
                    title="Italic"
                    disabled={!editable}
                  >
                    <span className="italic text-lg">I</span>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center ${line.underline ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onLineChange(idx, { underline: !line.underline })}
                    title="Underline"
                    disabled={!editable}
                  >
                    <span className="underline text-lg">U</span>
                  </button>
                </div>
                {/* Alignment */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Align:</span>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 ${line.alignment === 'left' ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onAlignmentChange(idx, 'left')}
                    title="Align Left"
                    disabled={!editable}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h10M4 18h12" />
                    </svg>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 ${line.alignment === 'center' ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onAlignmentChange(idx, 'center')}
                    title="Align Center"
                    disabled={!editable}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M8 12h8M6 18h12" />
                    </svg>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 ${line.alignment === 'right' ? 'bg-gray-100 border-gray-400' : ''}`}
                    onClick={() => onAlignmentChange(idx, 'right')}
                    title="Align Right"
                    disabled={!editable}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M12 12h8M4 18h16" />
                    </svg>
                  </button>
                </div>
                {/* Size Controls */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Size</span>
                  <div className="flex items-center">
                    {(() => {
                      // Get current size in pixels for display, prefer sizeNorm if available
                      const currentSizePx = line.sizeNorm ? sizeNormToPx(line.sizeNorm, designBox.height) : (line.size || 13);
                      const currentSizeNorm = line.sizeNorm ?? sizePxToNorm(line.size || 13, designBox.height);
                      const { min: minSizeNorm, max: maxSizeNorm } = getMinMaxSizeNorm(designBox.height);
                      
                      return (
                        <>
                          <button
                            type="button"
                            className="control-button w-6 h-6 flex items-center justify-center text-sm p-0"
                            onClick={() => {
                              const newSizeNorm = Math.max(minSizeNorm, currentSizeNorm - 0.01);
                              onLineChange(idx, { sizeNorm: newSizeNorm });
                            }}
                            disabled={currentSizeNorm <= minSizeNorm || !editable}
                          >-</button>
                          <span className="w-8 text-center text-sm">{currentSizePx}</span>
                          <button
                            type="button"
                            className="control-button w-6 h-6 flex items-center justify-center text-sm p-0"
                            onClick={() => {
                              const newSizeNorm = Math.min(maxSizeNorm, currentSizeNorm + 0.01);
                              onLineChange(idx, { sizeNorm: newSizeNorm });
                            }}
                            disabled={currentSizeNorm >= maxSizeNorm || !editable}
                          >+</button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
            {showRemove && badge.lines.length > 1 && (
              <button
                className="absolute top-2 right-2 control-button w-5 h-5 flex items-center justify-center bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
                onClick={() => onRemoveLine(idx)}
                disabled={!editable}
                title="Remove line"
              >
                <span style={{ fontSize: 14, color: '#b91c1c' }}>X</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Action buttons if provided */}
      <div className="flex flex-row gap-2 justify-end mt-2">
        {addLineButton}
        {multiBadgeButton}
        {resetButton}
      </div>
    </div>
  );
};