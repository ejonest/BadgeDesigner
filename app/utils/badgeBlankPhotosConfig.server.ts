import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BlankPhotoPlateConfig } from "~/utils/badgeBlankPhotos";

const CONFIG_PATH = path.join(
  process.cwd(),
  "app/data/badge-blank-photos.local.json",
);

type BadgeBlankPhotosFile = {
  version: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  templates: Record<string, BlankPhotoPlateConfig>;
  colorSuffixByHex: Record<string, string>;
};

export function readBadgeBlankPhotosConfigFile(): BadgeBlankPhotosFile {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as BadgeBlankPhotosFile;
}

export function writeBadgeBlankPhotoTemplateEntry(
  templateId: string,
  entry: BlankPhotoPlateConfig,
): BadgeBlankPhotosFile {
  const config = readBadgeBlankPhotosConfigFile();
  if (!config.templates[templateId]) {
    throw new Error(`Unknown template id: ${templateId}`);
  }
  config.templates[templateId] = {
    ...config.templates[templateId],
    ...entry,
  };
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}
