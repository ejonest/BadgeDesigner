import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type NormRect = {
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};

type SaveBody = {
  templateId: string;
  plaqueImageRectNorm: NormRect;
  plaquePhotoRectNorm?: NormRect | null;
};

function validRect(rect: NormRect | null | undefined): rect is NormRect {
  if (!rect) return false;
  const values = [rect.xNorm, rect.yNorm, rect.widthNorm, rect.heightNorm];
  return (
    values.every(Number.isFinite) &&
    rect.xNorm >= 0 &&
    rect.yNorm >= 0 &&
    rect.widthNorm > 0 &&
    rect.heightNorm > 0 &&
    rect.xNorm + rect.widthNorm <= 1.000001 &&
    rect.yNorm + rect.heightNorm <= 1.000001
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    return json(
      { ok: false, error: "Plaque calibration save is disabled in production." },
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
  if (!body.templateId?.trim() || !validRect(body.plaqueImageRectNorm)) {
    return json(
      { ok: false, error: "Missing template id or invalid image/icon bounds." },
      { status: 400 },
    );
  }
  if (
    body.plaquePhotoRectNorm != null &&
    !validRect(body.plaquePhotoRectNorm)
  ) {
    return json({ ok: false, error: "Invalid photo bounds." }, { status: 400 });
  }

  try {
    const configPath = join(
      process.cwd(),
      "app/data/plaque-templates.local.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      version: number;
      templates: Array<Record<string, unknown> & { id: string }>;
    };
    const template = config.templates.find((entry) => entry.id === body.templateId);
    if (!template) {
      return json({ ok: false, error: "Plaque template not found." }, { status: 404 });
    }

    template.plaqueImageRectNorm = body.plaqueImageRectNorm;
    // Only update photo opening when an explicit rect is provided (detached
    // calibration intentionally omits it — customers supply that photo).
    if (body.plaquePhotoRectNorm) {
      template.plaquePhotoRectNorm = body.plaquePhotoRectNorm;
    }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return json({
      ok: true,
      message: `Saved bounds for ${body.templateId}`,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save bounds.",
      },
      { status: 500 },
    );
  }
}
