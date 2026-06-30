import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { NormRect } from "~/utils/badgeBlankPhotos";
import { writeCustomBadgeBackgroundEntry } from "~/utils/badgeCustomBackgroundsConfig.server";

type SaveBody = {
  id: string;
  entry: {
    textRectNorm: NormRect;
    iconRectNorm: NormRect;
    badgeFaceRectNorm?: NormRect;
    textWithIconRectNorm?: NormRect;
    previewCropRectNorm?: NormRect;
  };
};

export async function action({ request }: ActionFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    return json(
      {
        ok: false,
        error: "Custom background calibration save is disabled in production.",
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

  const { id, entry } = body;
  if (!id?.trim() || !entry?.textRectNorm || !entry?.iconRectNorm) {
    return json({ ok: false, error: "Missing id or entry fields" }, {
      status: 400,
    });
  }

  const requiredNorms = ["textRectNorm", "iconRectNorm"] as const;
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
    writeCustomBadgeBackgroundEntry(id, entry);
    return json({
      ok: true,
      id,
      message: `Saved ${id} to badge-custom-backgrounds.local.json`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write failed";
    return json({ ok: false, error: message }, { status: 500 });
  }
}
