import React from "react";
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import {
  DESK_SIGN_MATERIALS,
  type DeskSignMaterial,
  getDeskSignTemplateTypesForMaterial,
} from "~/constants/designerVariants";
import type { DesignerVariant } from "~/constants/designerVariants";
import { TemplatePreviewThumb } from "./TemplatePreviewThumb";
import {
  DESK_SIGN_PLASTIC_STAND_COLORS,
  DESK_SIGN_PLATE_COLORS,
} from "~/utils/deskSignRender";

type MaterialPickerProps = {
  material: DeskSignMaterial;
  onMaterialChange: (material: DeskSignMaterial) => void;
};

export function DeskSignMaterialPicker({
  material,
  onMaterialChange,
}: MaterialPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {DESK_SIGN_MATERIALS.map((m) => {
        const selected = material === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`rounded-lg border p-3 text-left transition-all ${
              selected
                ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/20 bg-[#f8fafc]"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => onMaterialChange(m.id)}
          >
            <div className="font-semibold text-[#02132B]">{m.label}</div>
            <div className="text-xs text-[#6b7f92] mt-1">{m.sizeText}</div>
            <div className="text-xs text-[#4a5568] mt-2 leading-snug">
              {m.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

type DesignPickerProps = {
  variant: DesignerVariant;
  material: DeskSignMaterial;
  professionId: string | null;
  templates: LoadedTemplate[];
  templatePreviewSvgs: Record<string, string>;
  onProfessionChange: (professionId: string, templateId: string) => void;
};

export function DeskSignDesignPicker({
  variant,
  material,
  professionId,
  templates,
  templatePreviewSvgs,
  onProfessionChange,
}: DesignPickerProps) {
  const templateTypes = getDeskSignTemplateTypesForMaterial(material);
  const activeType = templateTypes[0];

  if (material === "plastic") {
    return (
      <p className="text-sm text-[#4a5568]">
        Classic gold-on-navy business nameplate layout (2×8″).
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {activeType?.professions?.map((prof) => {
        const tpl = templates.find((t) => t.id === prof.templateId);
        const previewSvg = templatePreviewSvgs[prof.templateId];
        const fallbackSrc = tpl?.svgFile
          ? tpl.svgFile.includes(" ")
            ? encodeURI(tpl.svgFile)
            : tpl.svgFile
          : "";
        const selected = professionId === prof.id;
        return (
          <button
            key={prof.id}
            type="button"
            className={`rounded-lg overflow-hidden border bg-white ${
              selected
                ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/20"
                : "border-gray-200"
            }`}
            style={{
              height: "120px",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={() => onProfessionChange(prof.id, prof.templateId)}
          >
            <div
              className={`text-center py-1 text-xs ${
                selected
                  ? "bg-[#1a3d5c] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {prof.name}
            </div>
            <div className="flex-1 flex items-center justify-center p-2 min-h-0">
              {previewSvg || fallbackSrc ? (
                <TemplatePreviewThumb
                  svgMarkup={previewSvg}
                  variant={variant}
                  alt={prof.name}
                  className="max-h-full max-w-full object-contain"
                  fallbackSrc={fallbackSrc}
                />
              ) : (
                <span className="text-xs text-gray-400">{prof.name}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

type ColorSwatchRowProps = {
  label: string;
  colors: readonly { value: string; name: string }[];
  selected: string | undefined;
  onSelect: (color: string) => void;
};

function ColorSwatchRow({
  label,
  colors,
  selected,
  onSelect,
}: ColorSwatchRowProps) {
  return (
    <div>
      <p className="text-xs font-medium text-[#6b7f92] mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            className={`w-8 h-8 rounded-full border-2 ${
              selected?.toUpperCase() === c.value.toUpperCase()
                ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/30"
                : "border-gray-200"
            }`}
            style={{ backgroundColor: c.value }}
            onClick={() => onSelect(c.value)}
          />
        ))}
      </div>
    </div>
  );
}

type ColorsPickerProps = {
  material: DeskSignMaterial;
  badge: Badge;
  onPlateColorChange: (color: string) => void;
  onStandColorChange: (color: string) => void;
};

export function DeskSignColorsPicker({
  material,
  badge,
  onPlateColorChange,
  onStandColorChange,
}: ColorsPickerProps) {
  if (material === "rosewood") {
    return (
      <ColorSwatchRow
        label="Plate"
        colors={DESK_SIGN_PLATE_COLORS}
        selected={badge.backgroundColor}
        onSelect={onPlateColorChange}
      />
    );
  }

  if (material === "plastic") {
    return (
      <div className="space-y-4">
        <ColorSwatchRow
          label="Insert plate"
          colors={DESK_SIGN_PLATE_COLORS}
          selected={badge.backgroundColor}
          onSelect={onPlateColorChange}
        />
        <ColorSwatchRow
          label="Stand"
          colors={DESK_SIGN_PLASTIC_STAND_COLORS}
          selected={badge.borderColor}
          onSelect={onStandColorChange}
        />
      </div>
    );
  }

  return (
    <p className="text-sm text-[#4a5568]">
      Clear acrylic is laser-etched — no plate color to choose.
    </p>
  );
}
