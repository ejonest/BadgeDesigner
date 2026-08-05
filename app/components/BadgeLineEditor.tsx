import React from 'react';
import { BadgeLine } from '../types/badge';
import { BADGE_CONSTANTS } from '../constants/badge';
import { FONT_COLORS } from '../constants/colors';
import { FONT_FAMILIES, DEFAULT_FONT } from '../constants/fonts';
import { ColorPicker } from './ColorPicker';
import { FontFamilySelect } from './FontFamilySelect';

interface BadgeLineEditorProps {
  line: BadgeLine;
  index: number;
  onUpdate: (index: number, updates: Partial<BadgeLine>) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
}

export const BadgeLineEditor: React.FC<BadgeLineEditorProps> = ({
  line,
  index,
  onUpdate,
  onRemove,
  showRemove
}) => {
  return (
    <div className="mb-4 p-4 rounded-lg bg-white shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium">Line {index + 1}</h3>
        {showRemove && (
          <button
            onClick={() => onRemove(index)}
            className="text-red-600 hover:text-red-800"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Text</label>
          <input
            type="text"
            value={(() => {
              const defaultText =
                index === 0 ? "Your Name" : index === 1 ? "Title" : "Line Text";
              const isEmptyOrDefault =
                !(line.text ?? "").trim() || line.text === defaultText;
              return isEmptyOrDefault ? "" : line.text;
            })()}
            onChange={(e) => onUpdate(index, { text: e.target.value })}
            placeholder={`Insert line ${index + 1} text here`}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Font Size</label>
          <input
            type="number"
            value={line.size}
            onChange={(e) => onUpdate(index, { size: Number(e.target.value) })}
            min={BADGE_CONSTANTS.MIN_FONT_SIZE}
            max={BADGE_CONSTANTS.MAX_FONT_SIZE}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Font Family</label>
          <div className="mt-1">
            <FontFamilySelect
              variant="legacy"
              value={line.fontFamily || DEFAULT_FONT}
              options={FONT_FAMILIES.map((font) => ({
                value: font.value,
                label: font.label,
              }))}
              onChange={(fontFamily) => onUpdate(index, { fontFamily })}
              ariaLabel={`Font for line ${index + 1}`}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Alignment</label>
          <select
            value={line.alignment}
            onChange={(e) => onUpdate(index, { alignment: e.target.value as 'left' | 'center' | 'right' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>

        <div className="col-span-2">
          <ColorPicker
            colors={FONT_COLORS}
            selectedColor={line.color}
            onChange={(color) => onUpdate(index, { color })}
            label="Text Color"
          />
        </div>

        <div className="col-span-2">
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={line.bold}
                onChange={(e) => onUpdate(index, { bold: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <span className="ml-2">Bold</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={line.italic}
                onChange={(e) => onUpdate(index, { italic: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <span className="ml-2">Italic</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={line.underline}
                onChange={(e) => onUpdate(index, { underline: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <span className="ml-2">Underline</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}; 