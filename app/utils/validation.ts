import { z } from "zod";
import { json } from "@remix-run/node";

/** Return 400 with Zod errors (no stack traces). */
export function validationError(
  errors: z.ZodIssue[],
  message = "Validation failed"
): ReturnType<typeof json> {
  const details = errors.map((e) => ({
    path: e.path.join(".") || "(root)",
    message: e.message,
  }));
  return json({ error: message, details }, { status: 400 });
}

/** Parse and validate; on failure return validationError response, otherwise return parsed data. */
export function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message = "Validation failed"
): { ok: true; data: T } | { ok: false; response: ReturnType<typeof json> } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: validationError(result.error.issues, message),
  };
}

// ---- Schemas for API routes ----

/** POST /api/save-badge – body */
export const saveBadgeBodySchema = z
  .object({
    designData: z.record(z.unknown()).refine((d) => d != null && typeof d === "object", "designData is required"),
    shopData: z.record(z.unknown()).optional(),
  })
  .strict();

/** POST /api/save-design – body (required: userId/shopId via designData or shopData) */
export const saveDesignBodySchema = z
  .object({
    designData: z.record(z.unknown()).optional(),
    shopData: z.record(z.unknown()).optional(),
    userId: z.string().optional(),
  })
  .strict();

/** GET /api/saved-design – query */
export const savedDesignQuerySchema = z
  .object({
    shop: z.string().min(1, "shop is required"),
    userId: z.string().min(1, "userId is required"),
  })
  .strict();

/** POST /api/update-badge – body */
export const updateBadgeBodySchema = z
  .object({
    id: z.string().min(1, "id is required"),
    updateData: z.record(z.unknown()).optional(),
  })
  .strict();

/** POST /api/upload-image – body */
export const uploadImageBodySchema = z
  .object({
    imageData: z.string().min(1, "imageData is required"),
    filename: z.string().optional(),
    contentType: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

/** POST /api/link-order-to-supabase – body */
export const linkOrderBodySchema = z
  .object({
    shopifyOrderId: z.string().min(1, "shopifyOrderId is required"),
    shopifyOrderNumber: z.string().optional(),
    shopifyCustomerId: z.string().optional(),
    lineItems: z.array(
      z.object({
        designId: z.string().optional(),
        gadgetDesignId: z.string().optional(),
        designData: z.unknown().optional(),
        badgeIndex: z.union([z.number(), z.string()]).optional(),
        quantity: z.number().optional(),
        badgeCount: z.union([z.number(), z.string()]).optional(),
      })
    ).min(1, "lineItems must be a non-empty array"),
  })
  .strict();

/** POST /api/add-to-cart – body */
export const addToCartBodySchema = z
  .object({
    badgeData: z.record(z.unknown()).refine((d) => d != null && typeof d === "object", "badgeData is required"),
  })
  .strict();
