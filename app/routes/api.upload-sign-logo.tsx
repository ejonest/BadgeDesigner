import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDesignerConfig } from "~/config/designers";
import { uploadImageToDesignerBucket } from "~/lib/designers/orderItemsStorage";

const MAX_BYTES = 12 * 1024 * 1024;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const form = await request.formData();
    const designId = String(form.get("designId") ?? "").trim();
    const file = form.get("file");

    if (!designId) {
      return json({ error: "designId is required" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return json({ error: "File too large (max 12MB)" }, { status: 400 });
    }

    const def = getDesignerConfig("sign");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
      ? ext
      : "png";
    const fileName = `${designId}/user-logo-${Date.now()}.${safeExt}`;
    const contentType =
      file.type ||
      (safeExt === "jpg" ? "image/jpeg" : `image/${safeExt}`);

    const publicUrl = await uploadImageToDesignerBucket(
      def,
      file,
      fileName,
      contentType,
    );
    return json({ success: true, publicUrl });
  } catch (e) {
    console.error("[api.upload-sign-logo]", e);
    return json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
