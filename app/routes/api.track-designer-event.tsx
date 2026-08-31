import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { parseOr400, trackDesignerEventBodySchema } from "~/utils/validation";
import { supabaseAdmin } from "~/utils/supabase";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      trackDesignerEventBodySchema,
      body,
      "Invalid request body",
    );
    if (!parsed.ok) return parsed.response;

    if (!supabaseAdmin) {
      return json({ ok: true, stored: false });
    }

    const row = parsed.data;
    const { error } = await supabaseAdmin.from("designer_events").insert({
      session_id: row.session_id,
      tool: row.tool,
      event: row.event,
      step: row.step ?? null,
      entry: row.entry ?? null,
      duration_ms: row.duration_ms ?? null,
      error_code: row.error_code ?? null,
      page_path: row.page_path ?? null,
    });

    if (error) {
      console.warn("[track-designer-event] insert failed:", error.message);
      return json({ ok: true, stored: false });
    }

    return json({ ok: true, stored: true });
  } catch (error) {
    console.warn("[track-designer-event]", error);
    return json({ ok: true, stored: false });
  }
}
