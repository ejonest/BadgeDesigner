import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { BlankPhotoPlateConfig } from "~/utils/badgeBlankPhotos";
import { writeBadgeBlankPhotoTemplateEntry } from "~/utils/badgeBlankPhotosConfig.server";

type SaveBody = {
  templateId: string;
  entry: BlankPhotoPlateConfig;
};

export async function action({ request }: ActionFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    return json(
      { ok: false, error: "Badge photo calibration save is disabled in production." },
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

  const { templateId, entry } = body;
  if (!templateId?.trim() || !entry?.assetFolder || !entry?.filePrefix) {
    return json({ ok: false, error: "Missing templateId or entry fields" }, {
      status: 400,
    });
  }

  const requiredNorms = [
    "textRectNorm",
    "iconRectNorm",
  ] as const;
  for (const key of requiredNorms) {
    const norm = entry[key];
    if (
      !norm ||
      typeof norm.xNorm !== "number" ||
      typeof norm.yNorm !== "number" ||
      typeof norm.widthNorm !== "number" ||
      typeof norm.heightNorm !== "number"
    ) {
      return json({ ok: false, error: `Invalid ${key}` }, { status: 400 });
    }
  }

  try {
    writeBadgeBlankPhotoTemplateEntry(templateId, entry);
    return json({
      ok: true,
      templateId,
      message: `Saved ${templateId} to badge-blank-photos.local.json`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write failed";
    return json({ ok: false, error: message }, { status: 500 });
  }
}
