import type { DesignerDefinition } from "~/config/designers";
import {
  supabaseAdmin,
  type BadgeOrderItem,
  getPacificTimestamp,
} from "~/utils/supabase";

/**
 * Persist print-ready SVG URLs on order-item rows.
 * Requires docs/migration_add_print_svg_url.sql (adds print_svg_url) to have
 * been run in Supabase — without that column, inserts/updates will fail.
 */
const INCLUDE_PRINT_SVG_URL_IN_DB = true;

/**
 * Persist designer state (Badge JSON) on order-item rows so a cart line can be
 * reopened for editing. Requires docs/migration_add_badge_json_to_order_items.sql
 * (adds badge_json + design_meta) to have been run in Supabase.
 */
const INCLUDE_BADGE_JSON_IN_DB = true;

async function toUploadBuffer(file: File | Blob): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

/** Columns added by later migrations; writes retry without them if a column is absent. */
const OPTIONAL_ROW_COLUMNS = [
  "print_svg_url",
  "badge_json",
  "design_meta",
] as const;

/** Name of the optional column an error blames, so the caller can drop it and retry. */
function missingOptionalColumn(
  err: { message?: string } | null,
): string | null {
  const message = err?.message;
  if (!message) return null;
  if (!/column|schema cache|Could not find/i.test(message)) return null;
  return (
    OPTIONAL_ROW_COLUMNS.find((col) =>
      new RegExp(col, "i").test(message),
    ) ?? null
  );
}

function hintIfStorageBucketMissing(bucket: string, message: string): string {
  if (!/bucket not found/i.test(message)) return message;
  return (
    `${message}. In Supabase: Dashboard → Storage → New bucket, id exactly "${bucket}". ` +
    `Enable Public bucket if you use getPublicUrl(); add a read policy for clients as needed.`
  );
}

function rowPayload(
  item: BadgeOrderItem,
  def: DesignerDefinition,
): Record<string, unknown> {
  const isMultiLineSignTable =
    def.orderItemsTable === "sign_order_items" ||
    def.orderItemsTable === "plaque_order_items";
  const isDeskSignTable = def.orderItemsTable === "desk_sign_order_items";
  const supportsUploadedImage = isMultiLineSignTable || isDeskSignTable;
  const base: Record<string, unknown> = {
    design_id: item.design_id,
    shopify_order_id: item.shopify_order_id,
    shopify_order_number: item.shopify_order_number,
    shopify_customer_id: item.shopify_customer_id,
    status: item.status ?? "draft",
    quantity: item.quantity ?? 1,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    ...(INCLUDE_PRINT_SVG_URL_IN_DB
      ? { print_svg_url: item.print_svg_url || null }
      : {}),
    ...(INCLUDE_BADGE_JSON_IN_DB
      ? {
          badge_json: item.badge_json ?? null,
          ...(item.design_meta ? { design_meta: item.design_meta } : {}),
        }
      : {}),
    ...(supportsUploadedImage && item.uploaded_image_url
      ? { uploaded_image_url: item.uploaded_image_url }
      : {}),
    pdf_url: item.pdf_url,
    background_color: item.background_color,
    line_1_text: item.line_1_text,
    line_1_font: item.line_1_font,
    line_1_font_size: item.line_1_font_size,
    line_1_bold: item.line_1_bold,
    line_1_underline: item.line_1_underline,
    line_1_italicize: item.line_1_italicize,
    line_1_color: item.line_1_color,
    line_1_alignment: item.line_1_alignment,
    line_2_text: item.line_2_text,
    line_2_font: item.line_2_font,
    line_2_font_size: item.line_2_font_size,
    line_2_bold: item.line_2_bold,
    line_2_underline: item.line_2_underline,
    line_2_italicize: item.line_2_italicize,
    line_2_color: item.line_2_color,
    line_2_alignment: item.line_2_alignment,
  };
  // Badges + desk signs store backing/material; multi-line signs/plaques do not.
  if (!isMultiLineSignTable) {
    base.backing_type = item.backing_type;
  }
  // Badges have 4 lines; signs/plaques have 6. Desk signs stop at 2.
  if (!isDeskSignTable) {
    base.line_3_text = item.line_3_text;
    base.line_3_font = item.line_3_font;
    base.line_3_font_size = item.line_3_font_size;
    base.line_3_bold = item.line_3_bold;
    base.line_3_underline = item.line_3_underline;
    base.line_3_italicize = item.line_3_italicize;
    base.line_3_color = item.line_3_color;
    base.line_3_alignment = item.line_3_alignment;
    base.line_4_text = item.line_4_text;
    base.line_4_font = item.line_4_font;
    base.line_4_font_size = item.line_4_font_size;
    base.line_4_bold = item.line_4_bold;
    base.line_4_underline = item.line_4_underline;
    base.line_4_italicize = item.line_4_italicize;
    base.line_4_color = item.line_4_color;
    base.line_4_alignment = item.line_4_alignment;
  }
  if (isMultiLineSignTable) {
    base.line_5_text = item.line_5_text;
    base.line_5_font = item.line_5_font;
    base.line_5_font_size = item.line_5_font_size;
    base.line_5_bold = item.line_5_bold;
    base.line_5_underline = item.line_5_underline;
    base.line_5_italicize = item.line_5_italicize;
    base.line_5_color = item.line_5_color;
    base.line_5_alignment = item.line_5_alignment;
    base.line_6_text = item.line_6_text;
    base.line_6_font = item.line_6_font;
    base.line_6_font_size = item.line_6_font_size;
    base.line_6_bold = item.line_6_bold;
    base.line_6_underline = item.line_6_underline;
    base.line_6_italicize = item.line_6_italicize;
    base.line_6_color = item.line_6_color;
    base.line_6_alignment = item.line_6_alignment;
  }
  base[def.lineIdColumn] = item.badge_id;
  return base;
}

/** Normalize DB row so order-slip PDF (BadgeOrderItem) always has badge_id set. */
export function normalizeRowForPdf(
  row: Record<string, unknown>,
  def: DesignerDefinition,
): BadgeOrderItem {
  const lineVal = row[def.lineIdColumn] ?? row.badge_id;
  return { ...row, badge_id: String(lineVal ?? "") } as BadgeOrderItem;
}

export async function uploadImageToDesignerBucket(
  def: DesignerDefinition,
  file: File | Blob,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const isImage =
    contentType.startsWith("image/") || contentType === "image/svg+xml";
  const hasImageExtension = fileName.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  if (!isImage && !hasImageExtension) {
    throw new Error(`Invalid file type for ${def.imageBucket}: ${contentType}`);
  }
  const body = await toUploadBuffer(file);
  const { error } = await supabaseAdmin.storage
    .from(def.imageBucket)
    .upload(fileName, body, {
      contentType,
      upsert: true,
      // Short TTL so CDN/browser revalidate after upsert to the same path (draft updates).
      cacheControl: "60",
    });
  if (error) {
    throw new Error(
      `Failed to upload to ${def.imageBucket}: ${hintIfStorageBucketMissing(def.imageBucket, error.message)}`,
    );
  }
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(def.imageBucket).getPublicUrl(fileName);
  return publicUrl;
}

export async function uploadPdfToDesignerBucket(
  def: DesignerDefinition,
  file: File | Blob,
  fileName: string,
  contentType = "application/pdf",
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (
    contentType !== "application/pdf" &&
    !fileName.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(`Invalid file type for ${def.pdfBucket}: ${contentType}`);
  }
  const body = await toUploadBuffer(file);
  const { error } = await supabaseAdmin.storage
    .from(def.pdfBucket)
    .upload(fileName, body, { contentType: "application/pdf", upsert: true });
  if (error) {
    throw new Error(
      `Failed to upload to ${def.pdfBucket}: ${hintIfStorageBucketMissing(def.pdfBucket, error.message)}`,
    );
  }
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(def.pdfBucket).getPublicUrl(fileName);
  return publicUrl;
}

export async function downloadFromDesignerImageBucket(
  def: DesignerDefinition,
  designId: string,
  fileName: string,
): Promise<Uint8Array | null> {
  if (!supabaseAdmin) return null;
  const path = `${designId}/${fileName}`;
  const { data, error } = await supabaseAdmin.storage
    .from(def.imageBucket)
    .download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

export async function saveDesignerOrderItems(
  def: DesignerDefinition,
  items: BadgeOrderItem[],
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  if (!items.length) return [];

  const omittedColumns = new Set<string>();
  const buildRows = () =>
    items.map((item) => {
      const payload = rowPayload(item, def);
      for (const col of omittedColumns) {
        delete payload[col];
      }
      return {
        ...payload,
        created_at: item.created_at || getPacificTimestamp(),
        updated_at: getPacificTimestamp(),
      };
    });

  const tryUpsert = async () => {
    const client = supabaseAdmin!;
    const itemsToInsert = buildRows();
    return client
      .from(def.orderItemsTable)
      .upsert(itemsToInsert, {
        onConflict: def.upsertOnConflict,
        ignoreDuplicates: false,
      })
      .select();
  };

  let { data, error } = await tryUpsert();

  for (let attempt = 0; attempt < OPTIONAL_ROW_COLUMNS.length; attempt++) {
    const missing = missingOptionalColumn(error);
    if (!missing || omittedColumns.has(missing)) break;
    console.warn(
      `saveDesignerOrderItems: ${missing} column missing; retrying without it`,
    );
    omittedColumns.add(missing);
    ({ data, error } = await tryUpsert());
  }

  if (error && /no unique|ON CONFLICT/i.test(error.message || "")) {
    console.warn(
      "saveDesignerOrderItems: upsert conflict target missing; falling back to delete+insert",
    );
    const designId = items[0]?.design_id;
    if (designId) {
      await deleteDesignerOrderItemsByDesignId(def, designId);
    }
    const rows = buildRows();
    const insertRes = await supabaseAdmin!
      .from(def.orderItemsTable)
      .insert(rows)
      .select();
    if (insertRes.error) {
      console.error("saveDesignerOrderItems insert fallback error:", insertRes.error);
      throw insertRes.error;
    }
    return insertRes.data;
  }

  if (error) {
    console.error("saveDesignerOrderItems error:", error);
    throw error;
  }
  return data;
}

/**
 * Draft autosave: merge into existing rows so we do not violate (design_id, line) uniqueness.
 * Inserts when no row exists. Skips rows already in_cart or order_placed so cart assets
 * cannot be overwritten if a design_id is reused.
 */
export async function saveDraftDesignerOrderItemsMerge(
  def: DesignerDefinition,
  designId: string,
  items: BadgeOrderItem[],
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const keepLineIds = items.map((_, i) => `${def.lineIdPrefix}-${i}`);
  await deleteDraftDesignerOrderItemsExcept(def, designId, keepLineIds);

  /** Retry a write, dropping one optional column per round until the schema accepts it. */
  const writeDroppingMissingColumns = async (
    payload: Record<string, unknown>,
    write: (body: Record<string, unknown>) => PromiseLike<{
      error: { message?: string } | null;
    }>,
  ) => {
    const body = { ...payload };
    let { error } = await write(body);
    for (let attempt = 0; attempt < OPTIONAL_ROW_COLUMNS.length; attempt++) {
      const missing = missingOptionalColumn(error);
      if (!missing || !(missing in body)) break;
      delete body[missing];
      ({ error } = await write(body));
    }
    if (error) throw error;
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lineKey = `${def.lineIdPrefix}-${i}`;
    const full = rowPayload(item, def);
    const { data: existing, error: selErr } = await supabaseAdmin
      .from(def.orderItemsTable)
      .select("id, status")
      .eq("design_id", designId)
      .eq(def.lineIdColumn, lineKey)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const terminal =
        existing.status === "in_cart" || existing.status === "order_placed";
      // Never mutate cart/order assets — a reused design_id must not rewrite
      // what the customer already added to cart.
      if (terminal) {
        continue;
      }
      const updateBody: Record<string, unknown> = {
        ...full,
        updated_at: getPacificTimestamp(),
      };
      const cleaned = Object.fromEntries(
        Object.entries(updateBody).filter(([, v]) => v !== undefined),
      );
      await writeDroppingMissingColumns(cleaned, (body) =>
        supabaseAdmin!
          .from(def.orderItemsTable)
          .update(body)
          .eq("id", existing.id),
      );
    } else {
      const insertPayload = {
        ...full,
        created_at: item.created_at || getPacificTimestamp(),
        updated_at: getPacificTimestamp(),
      };
      const cleanedInsert = Object.fromEntries(
        Object.entries(insertPayload).filter(([, v]) => v !== undefined),
      );
      await writeDroppingMissingColumns(cleanedInsert, (body) =>
        supabaseAdmin!.from(def.orderItemsTable).insert(body),
      );
    }
  }
}

export async function deleteDesignerOrderItemsByDesignId(
  def: DesignerDefinition,
  designId: string,
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .delete()
    .eq("design_id", designId);
  if (error) throw error;
}

/** Delete draft rows for design_id whose line id (badge_id / sign_id) is not in keepLineIds. */
export async function deleteDraftDesignerOrderItemsExcept(
  def: DesignerDefinition,
  designId: string,
  keepLineIds: string[],
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const lineCol = def.lineIdColumn;
  const { data: rows, error: selectError } = await supabaseAdmin
    .from(def.orderItemsTable)
    .select(`id, ${lineCol}`)
    .eq("design_id", designId)
    .eq("status", "draft");
  if (selectError) throw selectError;
  if (!rows?.length) return;
  const toDelete = rows
    .filter((r: Record<string, unknown>) => {
      const lid = r[lineCol] as string | null | undefined;
      return (
        typeof lid === "string" &&
        lid.length > 0 &&
        !keepLineIds.includes(lid)
      );
    })
    .map((r: Record<string, unknown>) => String(r.id));
  if (!toDelete.length) return;
  const { error: delError } = await supabaseAdmin
    .from(def.orderItemsTable)
    .delete()
    .in("id", toDelete);
  if (delError) throw delError;
}

export async function updateDesignerOrderItemsStatusByDesignId(
  def: DesignerDefinition,
  designId: string,
  status: string,
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .update({ status, updated_at: getPacificTimestamp() })
    .eq("design_id", designId);
  if (error) throw error;
}

/**
 * A cart line was replaced by an edited design, so its rows are no longer in a cart.
 * Only in_cart rows move back to draft; placed orders are never touched. Status has a
 * CHECK constraint, so draft is the accurate "not in a cart" state.
 */
export async function releaseReplacedCartOrderItems(
  def: DesignerDefinition,
  designId: string,
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .update({ status: "draft", updated_at: getPacificTimestamp() })
    .eq("design_id", designId)
    .eq("status", "in_cart");
  if (error) throw error;
}

export async function updateDesignerPdfUrlByDesignId(
  def: DesignerDefinition,
  designId: string,
  pdfUrl: string,
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .update({ pdf_url: pdfUrl, updated_at: getPacificTimestamp() })
    .eq("design_id", designId);
  if (error) throw error;
}

export async function getDesignerOrderItemsByDesignId(
  def: DesignerDefinition,
  designId: string,
): Promise<BadgeOrderItem[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .select("*")
    .eq("design_id", designId)
    .order(def.lineIdColumn, { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) =>
    normalizeRowForPdf(r as Record<string, unknown>, def),
  );
}

/** Line keys already in cart / ordered — draft uploads must not overwrite their storage. */
export async function getTerminalDesignerOrderItemLineKeys(
  def: DesignerDefinition,
  designId: string,
): Promise<Set<string>> {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .select(def.lineIdColumn)
    .eq("design_id", designId)
    .in("status", ["in_cart", "order_placed"]);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((r) => {
        const row = r as Record<string, unknown>;
        const key = row[def.lineIdColumn];
        return typeof key === "string" ? key : "";
      })
      .filter(Boolean),
  );
}

export async function updateDraftDesignerOrderItemsWithOrderInfo(
  def: DesignerDefinition,
  params: {
    lineItems: Array<{ designId: string; badgeIndex: number; quantity?: number }>;
    shopifyOrderId: string;
    shopifyOrderNumber?: string | null;
    shopifyCustomerId?: string | null;
  },
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const { lineItems, shopifyOrderId, shopifyOrderNumber, shopifyCustomerId } =
    params;
  if (!lineItems.length) return { data: [], error: null };

  const basePayload: Record<string, unknown> = {
    shopify_order_id: shopifyOrderId,
    status: "order_placed",
    updated_at: getPacificTimestamp(),
  };
  if (shopifyOrderNumber != null && shopifyOrderNumber !== "") {
    basePayload.shopify_order_number = shopifyOrderNumber;
  }
  if (shopifyCustomerId != null && shopifyCustomerId !== "") {
    basePayload.shopify_customer_id = shopifyCustomerId;
  }

  const results: unknown[] = [];
  for (const { designId, badgeIndex, quantity } of lineItems) {
    const lineKey = `${def.lineIdPrefix}-${badgeIndex}`;
    const payload = {
      ...basePayload,
      quantity: quantity != null && quantity >= 1 ? quantity : 1,
    };
    const { data, error } = await supabaseAdmin
      .from(def.orderItemsTable)
      .update(payload)
      .eq("design_id", designId)
      .eq(def.lineIdColumn, lineKey)
      .in("status", ["draft", "in_cart"])
      .select();
    if (error) throw error;
    if (data?.length) {
      for (const row of data) results.push(row);
    } else {
      console.warn(
        `[order-items] link-order: no row updated for table=${def.orderItemsTable} design_id=${designId} ${def.lineIdColumn}=${lineKey} (need status draft or in_cart)`,
      );
    }
  }
  return { data: results, error: null };
}
