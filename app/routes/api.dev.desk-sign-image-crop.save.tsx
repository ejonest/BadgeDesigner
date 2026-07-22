import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  DESK_SIGN_IMAGE_CROP_ASSETS,
  DESK_SIGN_IMAGE_CROP_CONFIG,
  type DeskSignImageCropRectNorm,
} from "~/utils/deskSignImageCrops";

type SaveBody = {
  assetId?: string;
  cropRectNorm?: DeskSignImageCropRectNorm;
};

function validNormRect(
  value: DeskSignImageCropRectNorm | undefined,
): value is DeskSignImageCropRectNorm {
  if (!value) return false;
  const values = [
    value.xNorm,
    value.yNorm,
    value.widthNorm,
    value.heightNorm,
  ];
  return (
    values.every(Number.isFinite) &&
    value.xNorm >= 0 &&
    value.yNorm >= 0 &&
    value.widthNorm > 0 &&
    value.heightNorm > 0 &&
    value.xNorm + value.widthNorm <= 1.00001 &&
    value.yNorm + value.heightNorm <= 1.00001
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    return json(
      {
        ok: false,
        error: "Desk-sign image crop saving is disabled in production.",
      },
      { status: 403 },
    );
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const asset = DESK_SIGN_IMAGE_CROP_ASSETS.find(
    (entry) => entry.id === body.assetId,
  );
  if (!asset || !validNormRect(body.cropRectNorm)) {
    return json(
      { ok: false, error: "Invalid asset or crop rectangle" },
      { status: 400 },
    );
  }

  try {
    const root = process.cwd();
    const sourcePath = path.join(
      root,
      "public",
      "images",
      "desk-sign",
      "source",
      asset.sourceFile,
    );
    const outputPath = path.join(
      root,
      "public",
      "images",
      "desk-sign",
      asset.outputFile,
    );
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Could not read source image dimensions.");
    }

    const rect = body.cropRectNorm;
    const left = Math.max(
      0,
      Math.min(metadata.width - 1, Math.round(rect.xNorm * metadata.width)),
    );
    const top = Math.max(
      0,
      Math.min(metadata.height - 1, Math.round(rect.yNorm * metadata.height)),
    );
    const width = Math.max(
      1,
      Math.min(
        metadata.width - left,
        Math.round(rect.widthNorm * metadata.width),
      ),
    );
    const height = Math.max(
      1,
      Math.min(
        metadata.height - top,
        Math.round(rect.heightNorm * metadata.height),
      ),
    );

    const resized = sharp(sourcePath)
      .extract({ left, top, width, height })
      .resize(
        DESK_SIGN_IMAGE_CROP_CONFIG.outputWidthPx,
        DESK_SIGN_IMAGE_CROP_CONFIG.outputHeightPx,
        { fit: "fill" },
      );
    if (asset.outputFile.toLowerCase().endsWith(".png")) {
      await resized.png({ compressionLevel: 9 }).toFile(outputPath);
    } else {
      await resized.jpeg({ quality: 92, mozjpeg: true }).toFile(outputPath);
    }

    const configPath = path.join(
      root,
      "app",
      "data",
      "desk-sign-image-crops.local.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      assets: Record<string, { cropRectNorm: DeskSignImageCropRectNorm }>;
    };
    config.assets[asset.id] = { cropRectNorm: rect };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    return json({
      ok: true,
      assetId: asset.id,
      outputUrl: `${asset.outputUrl}?v=${Date.now()}`,
      message: `Saved ${asset.label} crop`,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Crop save failed",
      },
      { status: 500 },
    );
  }
}
