import type { DesignerDefinition } from "~/config/designers";
import {
  supabaseAdmin,
  type BadgeOrderItem,
  getPacificTimestamp,
} from "~/utils/supabase";

async function toUploadBuffer(file: File | Blob): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
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
  const isSignTable =
    def.orderItemsTable === "sign_order_items" ||
    def.orderItemsTable === "plaque_order_items" ||
    def.orderItemsTable === "desk_sign_order_items";
  const base: Record<string, unknown> = {
    design_id: item.design_id,
    shopify_order_id: item.shopify_order_id,
    shopify_order_number: item.shopify_order_number,
    shopify_customer_id: item.shopify_customer_id,
    status: item.status ?? "draft",
    quantity: item.quantity ?? 1,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    print_svg_url: item.print_svg_url,
    ...(isSignTable && item.uploaded_image_url
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
    line_3_text: item.line_3_text,
    line_3_font: item.line_3_font,
    line_3_font_size: item.line_3_font_size,
    line_3_bold: item.line_3_bold,
    line_3_underline: item.line_3_underline,
    line_3_italicize: item.line_3_italicize,
    line_3_color: item.line_3_color,
    line_3_alignment: item.line_3_alignment,
    line_4_text: item.line_4_text,
    line_4_font: item.line_4_font,
    line_4_font_size: item.line_4_font_size,
    line_4_bold: item.line_4_bold,
    line_4_underline: item.line_4_underline,
    line_4_italicize: item.line_4_italicize,
    line_4_color: item.line_4_color,
    line_4_alignment: item.line_4_alignment,
  };
  if (!isSignTable) {
    base.backing_type = item.backing_type;
  }
  if (isSignTable) {
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
  const itemsToInsert = items.map((item) => ({
    ...rowPayload(item, def),
    created_at: item.created_at || getPacificTimestamp(),
    updated_at: getPacificTimestamp(),
  }));
  const { data, error } = await supabaseAdmin
    .from(def.orderItemsTable)
    .upsert(itemsToInsert, {
      onConflict: def.upsertOnConflict,
      ignoreDuplicates: false,
    })
    .select();
  if (error) {
    console.error("saveDesignerOrderItems error:", error);
    throw error;
  }
  return data;
}

/**
 * Draft autosave: merge into existing rows so we do not violate (design_id, line) uniqueness
 * after the customer has added to cart (status in_cart). Inserts only when no row exists.
 * Preserves status and Shopify order fields when status is in_cart or order_placed.
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
      let updateBody: Record<string, unknown>;
      if (terminal) {
        const {
          status: _st,
          shopify_order_id: _so,
          shopify_order_number: _sn,
          shopify_customer_id: _sc,
          ...restSafe
        } = full;
        updateBody = {
          ...restSafe,
          updated_at: getPacificTimestamp(),
        };
      } else {
        updateBody = {
          ...full,
          updated_at: getPacificTimestamp(),
        };
      }
      const cleaned = Object.fromEntries(
        Object.entries(updateBody).filter(([, v]) => v !== undefined),
      );
      const { error: upErr } = await supabaseAdmin
        .from(def.orderItemsTable)
        .update(cleaned)
        .eq("id", existing.id);
      if (upErr) throw upErr;
    } else {
      const insertPayload = {
        ...full,
        created_at: item.created_at || getPacificTimestamp(),
        updated_at: getPacificTimestamp(),
      };
      const cleanedInsert = Object.fromEntries(
        Object.entries(insertPayload).filter(([, v]) => v !== undefined),
      );
      const { error: insErr } = await supabaseAdmin
        .from(def.orderItemsTable)
        .insert(cleanedInsert);
      if (insErr) throw insErr;
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
