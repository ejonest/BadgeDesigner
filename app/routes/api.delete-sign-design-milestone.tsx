import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { deleteDesignLibraryMilestone } from "~/utils/supabase";
import { parseOr400, deleteDesignMilestoneBodySchema } from "~/utils/validation";

/** POST — delete one milestone row from `sign_designs` (not autosave). */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      deleteDesignMilestoneBodySchema,
      body,
      "Invalid request body",
    );
    if (!parsed.ok) return parsed.response;

    const { shopId, userId, designId } = parsed.data;
    await deleteDesignLibraryMilestone(
      "sign_designs",
      userId.trim(),
      shopId.trim(),
      designId.trim(),
    );
    return json({ success: true });
  } catch (error) {
    console.error("[api.delete-sign-design-milestone]", error);
    const details =
      error instanceof Error ? error.message : "Unknown error";
    return json(
      { error: "Failed to delete design", details },
      { status: 500 },
    );
  }
}
