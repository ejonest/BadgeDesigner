import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NormRect } from "~/utils/badgeBlankPhotos";

const CONFIG_PATH = path.join(
  process.cwd(),
  "app/data/badge-custom-backgrounds.local.json",
);

export type CustomBadgeBackgroundConfigEntry = {
  id: string;
  name: string;
  category: string;
  templateId: string;
  fileName: string;
  textRectNorm: NormRect;
  iconRectNorm: NormRect;
  badgeFaceRectNorm?: NormRect;
  textWithIconRectNorm?: NormRect;
  previewCropRectNorm?: NormRect;
};

type CustomBadgeBackgroundsFile = {
  version: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  backgrounds: CustomBadgeBackgroundConfigEntry[];
};

export function readCustomBadgeBackgroundsConfigFile(): CustomBadgeBackgroundsFile {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as CustomBadgeBackgroundsFile;
}

export function writeCustomBadgeBackgroundEntry(
  id: string,
  entry: Partial<
    Pick<
      CustomBadgeBackgroundConfigEntry,
      | "textRectNorm"
      | "iconRectNorm"
      | "badgeFaceRectNorm"
      | "textWithIconRectNorm"
      | "previewCropRectNorm"
    >
  >,
): CustomBadgeBackgroundsFile {
  const config = readCustomBadgeBackgroundsConfigFile();
  const index = config.backgrounds.findIndex((b) => b.id === id);
  if (index < 0) {
    throw new Error(`Unknown custom background id: ${id}`);
  }
  config.backgrounds[index] = {
    ...config.backgrounds[index],
    ...entry,
  };
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}
