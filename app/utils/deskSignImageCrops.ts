import cropConfigJson from "~/data/desk-sign-image-crops.local.json";

export type DeskSignImageCropRectNorm = {
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};

export type DeskSignImageCropAsset = {
  id: string;
  label: string;
  group: "Choose material" | "Acrylic finish" | "Rosewood plate";
  sourceFile: string;
  sourceUrl: string;
  outputFile: string;
  outputUrl: string;
};

export const DESK_SIGN_IMAGE_CROP_ASSETS: readonly DeskSignImageCropAsset[] = [
  {
    id: "material-acrylic",
    label: "Acrylic material",
    group: "Choose material",
    sourceFile: "acrylicEx.jpg",
    sourceUrl: "/images/desk-sign/source/acrylicEx.jpg",
    outputFile: "acrylicEx.jpg",
    outputUrl: "/images/desk-sign/acrylicEx.jpg",
  },
  {
    id: "material-traditional",
    label: "Traditional material",
    group: "Choose material",
    sourceFile: "plasticEx.jpg",
    sourceUrl: "/images/desk-sign/source/plasticEx.jpg",
    outputFile: "plasticEx.jpg",
    outputUrl: "/images/desk-sign/plasticEx.jpg",
  },
  {
    id: "acrylic-clear",
    label: "Clear acrylic",
    group: "Acrylic finish",
    sourceFile: "ClearAcrylic.jpg",
    sourceUrl: "/images/desk-sign/source/ClearAcrylic.jpg",
    outputFile: "ClearAcrylic.jpg",
    outputUrl: "/images/desk-sign/ClearAcrylic.jpg",
  },
  {
    id: "acrylic-frosted",
    label: "Frosted acrylic",
    group: "Acrylic finish",
    sourceFile: "FrostedAcrylic.jpg",
    sourceUrl: "/images/desk-sign/source/FrostedAcrylic.jpg",
    outputFile: "FrostedAcrylic.jpg",
    outputUrl: "/images/desk-sign/FrostedAcrylic.jpg",
  },
  {
    id: "acrylic-black",
    label: "Black acrylic",
    group: "Acrylic finish",
    sourceFile: "BlackAcrylic.jpg",
    sourceUrl: "/images/desk-sign/source/BlackAcrylic.jpg",
    outputFile: "BlackAcrylic.jpg",
    outputUrl: "/images/desk-sign/BlackAcrylic.jpg",
  },
  {
    id: "rosewood-black-gold",
    label: "Black Gold plate",
    group: "Rosewood plate",
    sourceFile: "RWBlackGold.png",
    sourceUrl: "/images/desk-sign/source/RWBlackGold.png",
    outputFile: "RWBlackGold.png",
    outputUrl: "/images/desk-sign/RWBlackGold.png",
  },
  {
    id: "rosewood-gold",
    label: "Gold plate",
    group: "Rosewood plate",
    sourceFile: "RWGold.png",
    sourceUrl: "/images/desk-sign/source/RWGold.png",
    outputFile: "RWGold.png",
    outputUrl: "/images/desk-sign/RWGold.png",
  },
  {
    id: "rosewood-silver",
    label: "Silver plate / material card",
    group: "Rosewood plate",
    sourceFile: "RWSilver.png",
    sourceUrl: "/images/desk-sign/source/RWSilver.png",
    outputFile: "RWSilver.png",
    outputUrl: "/images/desk-sign/RWSilver.png",
  },
] as const;

type CropConfigFile = {
  version: number;
  outputWidthPx: number;
  outputHeightPx: number;
  assets: Record<string, { cropRectNorm: DeskSignImageCropRectNorm }>;
};

export const DESK_SIGN_IMAGE_CROP_CONFIG =
  cropConfigJson as CropConfigFile;

export const DESK_SIGN_IMAGE_OUTPUT_ASPECT =
  DESK_SIGN_IMAGE_CROP_CONFIG.outputWidthPx /
  DESK_SIGN_IMAGE_CROP_CONFIG.outputHeightPx;

export function getDeskSignImageCropRect(
  assetId: string,
): DeskSignImageCropRectNorm {
  return (
    DESK_SIGN_IMAGE_CROP_CONFIG.assets[assetId]?.cropRectNorm ?? {
      xNorm: 0,
      yNorm: 0.3,
      widthNorm: 1,
      heightNorm: 0.4,
    }
  );
}
