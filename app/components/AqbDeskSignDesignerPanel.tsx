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
  DESK_SIGN_ACRYLIC_FINISHES,
  DESK_SIGN_ALUMINUM_COLORS,
  DESK_SIGN_PLASTIC_PLATE_FINISHES,
  DESK_SIGN_ROSEWOOD_PLATE_FINISHES,
  findDeskSignAcrylicFinish,
  findDeskSignPlasticPlateFinish,
  findDeskSignRosewoodPlateFinish,
  type DeskSignAcrylicFinishId,
  type DeskSignAluminumColorId,
  type DeskSignMountType,
  type DeskSignRosewoodPlateFinishId,
} from "~/utils/deskSignRender";

type MaterialPickerProps = {
  material: DeskSignMaterial | null;
  onMaterialChange: (material: DeskSignMaterial) => void;
};

export function DeskSignMaterialPicker({
  material,
  onMaterialChange,
}: MaterialPickerProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
        UV-printed plastic plate — choose the plate color next.
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
  material: DeskSignMaterial | null;
  badge: Badge;
  /** False until the customer explicitly picks a finish (preview defaults don't count). */
  hasChosenPlateColor?: boolean;
  onPlateColorChange: (color: string) => void;
  onStandColorChange: (color: string) => void;
  onAcrylicFinishChange?: (finishId: DeskSignAcrylicFinishId) => void;
  onRosewoodPlateFinishChange?: (finishId: DeskSignRosewoodPlateFinishId) => void;
  onPlasticPlateFinishChange?: (finishId: string) => void;
};

export function DeskSignColorsPicker({
  material,
  badge,
  hasChosenPlateColor = true,
  onAcrylicFinishChange,
  onRosewoodPlateFinishChange,
  onPlasticPlateFinishChange,
}: ColorsPickerProps) {
  if (!material) {
    return (
      <p className="text-sm text-[#4a5568]">
        Choose a material first to see finish options.
      </p>
    );
  }
  if (material === "acrylic") {
    const selected = findDeskSignAcrylicFinish(
      badge.deskSignAcrylicFinish,
    )?.id;
    return (
      <div>
        <p className="mb-2 text-xs font-bold text-[#02132B]">
          Acrylic finish
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DESK_SIGN_ACRYLIC_FINISHES.map((finish) => (
            <button
              key={finish.id}
              type="button"
              className={`rounded-lg border p-3 text-left transition-all ${
                selected === finish.id
                  ? "border-[#1a3d5c] bg-[#f8fafc] ring-2 ring-[#1a3d5c]/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => onAcrylicFinishChange?.(finish.id)}
            >
              <div className="mb-2 aspect-[5/2] w-full overflow-hidden rounded border border-black/15 bg-[#eef2f6]">
                <img
                  src={finish.imageSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="text-sm font-semibold text-[#02132B]">
                {finish.label}
              </div>
              <div className="mt-1 text-xs leading-snug text-[#6b7f92]">
                {finish.description}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#6b7f92]">
          Print color is fixed for the selected acrylic finish.
        </p>
      </div>
    );
  }

  if (material === "rosewood") {
    const selected =
      findDeskSignRosewoodPlateFinish(badge.backgroundColor)?.id ?? null;
    return (
      <div>
        <p className="text-xs font-bold text-[#02132B] mb-2">Plate</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DESK_SIGN_ROSEWOOD_PLATE_FINISHES.map((finish) => {
            const isSelected = selected === finish.id;
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
                <div className="mb-2 aspect-[5/2] w-full overflow-hidden rounded border border-black/10 bg-[#eef2f6]">
                  <img
                    src={finish.imageSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
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
    const selected = hasChosenPlateColor
      ? findDeskSignPlasticPlateFinish(badge.backgroundColor)?.id ?? null
      : null;
    return (
      <div>
        <p className="text-xs font-bold text-[#02132B] mb-2">Plate color</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DESK_SIGN_PLASTIC_PLATE_FINISHES.map((finish) => {
            const isSelected = selected === finish.id;
            const light =
              finish.plateColor.toUpperCase() === "#FFFFFF" ||
              finish.plateColor.toUpperCase() === "#F5F0E6" ||
              finish.plateColor.toUpperCase() === "#B8BDC4" ||
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

  return null;
}

type PlasticMountPickerProps = {
  mountType: DeskSignMountType | undefined;
  aluminumColor: DeskSignAluminumColorId | undefined;
  onMountTypeChange: (mountType: DeskSignMountType) => void;
  onAluminumColorChange: (color: DeskSignAluminumColorId) => void;
};

export function DeskSignPlasticMountPicker({
  mountType,
  aluminumColor,
  onMountTypeChange,
  onAluminumColorChange,
}: PlasticMountPickerProps) {
  const mountOptions: readonly {
    id: DeskSignMountType;
    label: string;
    description: string;
  }[] = [
    {
      id: "desk-stand",
      label: "Desk Stand",
      description: "Aluminum stand for a desktop or counter",
    },
    {
      id: "wall-mount",
      label: "Wall Mount",
      description: "Aluminum mounting frame for a wall",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold text-[#02132B]">Mount type</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {mountOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-lg border p-3 text-left transition-all ${
                mountType === option.id
                  ? "border-[#1a3d5c] bg-[#f8fafc] ring-2 ring-[#1a3d5c]/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => onMountTypeChange(option.id)}
            >
              <div className="text-sm font-semibold text-[#02132B]">
                {option.label}
              </div>
              <div className="mt-1 text-xs text-[#6b7f92]">
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold text-[#02132B]">
          Aluminum Frame
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DESK_SIGN_ALUMINUM_COLORS.map((finish) => {
            const frameImageSrc =
              mountType === "wall-mount"
                ? finish.wallImageSrc
                : finish.imageSrc;
            return (
            <button
              key={finish.id}
              type="button"
              className={`rounded-lg border p-2 text-left transition-all ${
                aluminumColor === finish.id
                  ? "border-[#1a3d5c] bg-[#f8fafc] ring-2 ring-[#1a3d5c]/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => onAluminumColorChange(finish.id)}
            >
              <div className="mb-2 w-full overflow-hidden rounded border border-black/10 bg-white">
                <img
                  key={frameImageSrc}
                  src={frameImageSrc}
                  alt=""
                  className="block h-auto w-full"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="text-xs font-semibold text-[#02132B]">
                {finish.label}
              </div>
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
