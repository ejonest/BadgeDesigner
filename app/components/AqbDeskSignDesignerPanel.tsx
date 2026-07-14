import React from "react";
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import {
  DESK_SIGN_MATERIALS,
  type DeskSignMaterial,
  deskSignMaterialUsesPlasticFinishes,
  getDeskSignTemplateTypesForMaterial,
} from "~/constants/designerVariants";
import type { DesignerVariant } from "~/constants/designerVariants";
import { TemplatePreviewThumb } from "./TemplatePreviewThumb";
import {
  DESK_SIGN_PLASTIC_PLATE_FINISHES,
  DESK_SIGN_ROSEWOOD_PLATE_FINISHES,
  findDeskSignPlasticPlateFinish,
  findDeskSignRosewoodPlateFinish,
  type DeskSignRosewoodPlateFinishId,
} from "~/utils/deskSignRender";
import { plaqueMetalBrushCssBackgroundImage } from "~/utils/plaqueRender";
import {
  FEATURED_BRUSHED_BLACK_HEX,
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
} from "~/constants/colors";

type MaterialPickerProps = {
  material: DeskSignMaterial;
  onMaterialChange: (material: DeskSignMaterial) => void;
};

export function DeskSignMaterialPicker({
  material,
  onMaterialChange,
}: MaterialPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {DESK_SIGN_MATERIALS.map((m) => {
        const selected = material === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`rounded-lg border overflow-hidden text-left transition-all ${
              selected
                ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/20 bg-[#f8fafc]"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => onMaterialChange(m.id)}
          >
            <div className="aspect-[5/2] w-full bg-[#eef2f6] overflow-hidden">
              <img
                src={m.exampleImageSrc}
                alt=""
                className="h-full w-full object-cover object-center"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="p-2.5">
              <div className="font-semibold text-[#02132B] text-sm leading-tight">
                {m.label}
              </div>
              <div className="text-xs text-[#6b7f92] mt-0.5">{m.sizeText}</div>
              <div className="text-[11px] text-[#4a5568] mt-1.5 leading-snug">
                {m.description}
              </div>
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

  if (deskSignMaterialUsesPlasticFinishes(material)) {
    return (
      <p className="text-sm text-[#4a5568]">
        {material === "wall-mount"
          ? "Engraved plastic wall plate (2×10″) — choose plate color next."
          : "Engraved plastic desk plate with stand (2×8″) — choose plate color next."}
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

type ColorsPickerProps = {
  material: DeskSignMaterial;
  badge: Badge;
  onPlateColorChange: (color: string) => void;
  onStandColorChange: (color: string) => void;
  onRosewoodPlateFinishChange?: (finishId: DeskSignRosewoodPlateFinishId) => void;
  onPlasticPlateFinishChange?: (finishId: string) => void;
};

export function DeskSignColorsPicker({
  material,
  badge,
  onRosewoodPlateFinishChange,
  onPlasticPlateFinishChange,
}: ColorsPickerProps) {
  if (material === "rosewood") {
    const selected =
      findDeskSignRosewoodPlateFinish(badge.backgroundColor)?.id ?? null;
    return (
      <div>
        <p className="text-xs font-medium text-[#6b7f92] mb-2">Plate</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DESK_SIGN_ROSEWOOD_PLATE_FINISHES.map((finish) => {
            const isSelected = selected === finish.id;
            const brushCss =
              finish.plateColor.toUpperCase() ===
                FEATURED_BRUSHED_GOLD_HEX.toUpperCase() ||
              finish.plateColor.toUpperCase() ===
                FEATURED_BRUSHED_SILVER_HEX.toUpperCase() ||
              finish.plateColor.toUpperCase() ===
                FEATURED_BRUSHED_BLACK_HEX.toUpperCase()
                ? plaqueMetalBrushCssBackgroundImage(finish.plateColor)
                : undefined;
            return (
              <button
                key={finish.id}
                type="button"
                className={`rounded-lg border p-3 text-left transition-all ${
                  isSelected
                    ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/20 bg-[#f8fafc]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => onRosewoodPlateFinishChange?.(finish.id)}
              >
                <div
                  className="mb-2 h-8 w-full rounded border border-black/10"
                  style={{
                    backgroundColor: finish.plateColor,
                    ...(brushCss ? { backgroundImage: brushCss } : {}),
                  }}
                />
                <div className="font-semibold text-[#02132B] text-sm">
                  {finish.label}
                </div>
                <div className="text-xs text-[#6b7f92] mt-1 leading-snug">
                  {finish.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (deskSignMaterialUsesPlasticFinishes(material)) {
    const selected =
      findDeskSignPlasticPlateFinish(badge.backgroundColor)?.id ?? null;
    return (
      <div>
        <p className="text-xs font-medium text-[#6b7f92] mb-2">Plate color</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {DESK_SIGN_PLASTIC_PLATE_FINISHES.map((finish) => {
            const isSelected = selected === finish.id;
            const light =
              finish.plateColor.toUpperCase() === "#FFFFFF" ||
              finish.plateColor.toUpperCase() === "#E8D5B7" ||
              finish.plateColor.toUpperCase() === "#F9A825" ||
              finish.plateColor.toUpperCase() === "#B0B0B0" ||
              finish.plateColor.toUpperCase() === "#C9A66B";
            return (
              <button
                key={finish.id}
                type="button"
                title={finish.label}
                className={`rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? "border-[#1a3d5c] ring-2 ring-[#1a3d5c]/20 bg-[#f8fafc]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => onPlasticPlateFinishChange?.(finish.id)}
              >
                <div
                  className={`mb-2 h-8 w-full rounded ${
                    light ? "border border-black/15" : "border border-black/10"
                  }`}
                  style={{ backgroundColor: finish.plateColor }}
                />
                <div className="text-xs font-semibold text-[#02132B] leading-tight">
                  {finish.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm text-[#4a5568]">
      Preview uses a white plate so you can see your engraved text. Acrylic is
      laser-etched — text color can’t be changed.
    </p>
  );
}
