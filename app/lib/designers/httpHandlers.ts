import { json } from "@remix-run/node";
import {
  type DesignerId,
  getDesignLibraryTable,
  getDesignerConfig,
  resolveGadgetApiKey,
  resolveGadgetUrl,
  resolveLinkOrderSecret,
} from "~/config/designers";
import {
  deleteDesignerOrderItemsByDesignId,
  downloadFromDesignerImageBucket,
  getDesignerOrderItemsByDesignId,
  saveDraftDesignerOrderItemsMerge,
  saveDesignerOrderItems,
  updateDesignerOrderItemsStatusByDesignId,
  updateDesignerPdfUrlByDesignId,
  updateDraftDesignerOrderItemsWithOrderInfo,
  uploadImageToDesignerBucket,
  uploadPdfToDesignerBucket,
} from "~/lib/designers/orderItemsStorage";
import { generateOrderSlipPdf } from "~/utils/orderSlipPdf";
import {
  convertBadgeToOrderItem,
  downloadBytesFromStorageUrl,
  insertOrderedDesignSnapshotFromCart,
} from "~/utils/supabase";
import {
  linkOrderBodySchema,
  parseOr400,
  saveBadgeBodySchema,
} from "~/utils/validation";

const LOG_PREFIX = "[Designer]";

/** Draft autosave: uploads to designer image bucket + sign_order_items / badge_order_items. */
export async function runSaveDraftDesigner(
  designerId: DesignerId,
  request: Request,
): Promise<Response> {
  const def = getDesignerConfig(designerId);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  console.log(
    `${LOG_PREFIX} save-draft (${designerId})`,
    new Date().toISOString(),
  );
  try {
    const formData = await request.formData();
    const designId = (formData.get("designId") as string)?.trim();
    if (!designId) {
      return json(
        { success: false, error: "designId is required" },
        { status: 400 },
      );
    }
    const designDataRaw = formData.get("designData");
    const designData =
      typeof designDataRaw === "string"
        ? JSON.parse(designDataRaw)
        : designDataRaw;
    if (!designData) {
      return json(
        { success: false, error: "designData is required" },
        { status: 400 },
      );
    }
    const shopifyCustomerId =
      (formData.get("shopifyCustomerId") as string) || null;

    const allBadges =
      designData.allBadges || (designData.badge ? [designData.badge] : []);
    if (allBadges.length === 0) {
      return json(
        { success: false, error: "No badges in designData" },
        { status: 400 },
      );
    }

    const orderItems: ReturnType<typeof convertBadgeToOrderItem>[] = [];

    for (let badgeIndex = 0; badgeIndex < allBadges.length; badgeIndex++) {
      const badge = allBadges[badgeIndex];
      const thumbnailPngFile = formData.get(
        `thumbnail_png_${badgeIndex}`,
      ) as File | null;
      const svgFile = formData.get(`svg_${badgeIndex}`) as File | null;
      const printSvgFile = formData.get(
        `print_svg_${badgeIndex}`,
      ) as File | null;

      let thumbnailUrl = "";
      let fullImageUrl = "";
      let printSvgUrl = "";

      const uploadJobs: Promise<void>[] = [];

      if (thumbnailPngFile?.size) {
        const thumbType =
          thumbnailPngFile.type && thumbnailPngFile.type.startsWith("image/")
            ? thumbnailPngFile.type
            : "image/jpeg";
        const thumbExt = thumbType.includes("png")
          ? "png"
          : thumbType.includes("webp")
            ? "webp"
            : "jpg";
        uploadJobs.push(
          (async () => {
            try {
              const thumbnailFileName = `${designId}/${def.lineIdPrefix}-${badgeIndex}-thumbnail.${thumbExt}`;
              thumbnailUrl = await uploadImageToDesignerBucket(
                def,
                thumbnailPngFile,
                thumbnailFileName,
                thumbType,
              );
            } catch (err) {
              console.warn(
                `[save-draft-${designerId}] Thumbnail upload failed line ${badgeIndex}:`,
                err,
              );
            }
          })(),
        );
      }

      if (svgFile?.size) {
        uploadJobs.push(
          (async () => {
            try {
              const svgFileName = `${designId}/${def.lineIdPrefix}-${badgeIndex}-design.svg`;
              fullImageUrl = await uploadImageToDesignerBucket(
                def,
                svgFile,
                svgFileName,
                "image/svg+xml",
              );
            } catch (err) {
              console.warn(
                `[save-draft-${designerId}] SVG upload failed line ${badgeIndex}:`,
                err,
              );
            }
          })(),
        );
      }

      if (printSvgFile?.size) {
        uploadJobs.push(
          (async () => {
            try {
              const printSvgFileName = `${designId}/${def.lineIdPrefix}-${badgeIndex}-print.svg`;
              printSvgUrl = await uploadImageToDesignerBucket(
                def,
                printSvgFile,
                printSvgFileName,
                "image/svg+xml",
              );
            } catch (err) {
              console.warn(
                `[save-draft-${designerId}] Print SVG upload failed line ${badgeIndex}:`,
                err,
              );
            }
          })(),
        );
      }

      await Promise.all(uploadJobs);

      const item = convertBadgeToOrderItem(badge, designId, badgeIndex, {
        thumbnail_url: thumbnailUrl,
        full_image_url: fullImageUrl,
        print_svg_url: printSvgUrl,
        shopify_customer_id: shopifyCustomerId ?? undefined,
        lineIdPrefix: def.lineIdPrefix,
      });
      item.status = "draft";
      orderItems.push(item);
    }

    await saveDraftDesignerOrderItemsMerge(def, designId, orderItems);

    const thumbnailUrls = orderItems.map((i) => i.thumbnail_url || "");
    console.log(
      `[BadgeDesigner] save-draft-${designerId} OK:`,
      designId,
      "savedCount:",
      orderItems.length,
    );
    return json({
      success: true,
      thumbnailUrls,
      savedCount: orderItems.length,
    });
  } catch (err) {
    console.error(`[save-draft-${designerId}] error:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, { status: 500 });
  }
}

export async function runSaveToGadget(
  designerId: DesignerId,
  request: Request,
): Promise<Response> {
  const def = getDesignerConfig(designerId);
  console.log(
    `${LOG_PREFIX} save (${designerId})`,
    new Date().toISOString(),
    request.method,
  );
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(saveBadgeBodySchema, body, "Invalid request body");
  if (!parsed.ok) return parsed.response;
  const { designData, shopData } = parsed.data;

  const GADGET_API_URL = resolveGadgetUrl(def);
  const GADGET_API_KEY = resolveGadgetApiKey(def);

  if (!GADGET_API_KEY) {
    const designId = `design_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    return json({
      success: true,
      id: designId,
      designId,
      designData,
      fallback: true,
      message: "Saved locally (Gadget API not configured)",
    });
  }

  const badgeDesignData = designData.badge || designData;
  const fullDesignDataForStorage =
    designData.allBadges != null
      ? designData
      : { ...designData, badge: badgeDesignData };

  const textLinesForGadget =
    (Array.isArray(designData.textLines) && designData.textLines.length > 0
      ? designData.textLines
      : undefined) ??
    (Array.isArray(designData.allBadges) && designData.allBadges[0]
      ? (designData.allBadges[0] as { lines?: unknown }).lines
      : undefined) ??
    (badgeDesignData as { lines?: unknown }).lines ??
    [];

  const gadgetPayload = {
    shopId: shopData?.shopId || "75389960447",
    productId: designData.productId,
    designId:
      designData.designId ||
      `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: "saved" as const,
    designData: JSON.stringify(fullDesignDataForStorage),
    backgroundColor: badgeDesignData.backgroundColor || "#FFFFFF",
    backingType: badgeDesignData.backing || "magnetic",
    basePrice: "9.99",
    backingPrice: "0",
    totalPrice: "9.99",
    textLines: JSON.stringify(textLinesForGadget),
  };

  const g = def.gadget;
  const graphqlUrl = `${GADGET_API_URL.replace(/\/$/, "")}/api/graphql`;
  console.log(
    `${LOG_PREFIX} Gadget GraphQL (${designerId})`,
    graphqlUrl,
    `mutation=${g.createField}`,
  );
  const createMutation = `
      mutation CreateDesign($${g.inputVariable}: ${g.inputType}!) {
        ${g.createField}(${g.inputVariable}: $${g.inputVariable}) {
          success
          errors { message code }
          ${g.resultSelection} {
            id
            designId
            shopId
            status
          }
        }
      }
    `;

  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GADGET_API_KEY}`,
      },
      body: JSON.stringify({
        query: createMutation,
        variables: { [g.inputVariable]: gadgetPayload },
      }),
    });
    const data = await res.json();
    if (data.errors?.length) {
      throw new Error(
        data.errors.map((e: { message: string }) => e.message).join("; "),
      );
    }
    const createResult = data.data?.[g.createField];
    const created = createResult?.[g.resultSelection];
    if (!createResult?.success || !created) {
      throw new Error(createResult?.errors?.[0]?.message || "Create failed");
    }
    const result = {
      id: created.id,
      designId: created.designId ?? created.id,
    };
    return json({
      success: true,
      id: result.id,
      designId: result.designId,
      designData,
    });
  } catch (apiError) {
    console.error(`${LOG_PREFIX} save Gadget error (${designerId}):`, apiError);
    const designId = `design_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    return json({
      success: true,
      id: designId,
      designId,
      designData,
      fallback: true,
      message: "Saved locally (Gadget API call failed)",
      error:
        apiError instanceof Error ? apiError.message : "Unknown API error",
    });
  }
}

export async function runSendOrderDraftToSupabase(
  designerId: DesignerId,
  request: Request,
): Promise<Response> {
  const def = getDesignerConfig(designerId);
  console.log(
    `${LOG_PREFIX} send-to-supabase (${designerId})`,
    new Date().toISOString(),
  );

  try {
    const formData = await request.formData();
    const storageOnly =
      formData.get("storageOnly") === "true" ||
      new URL(request.url).searchParams.get("storageOnly") === "true";

    const designId = formData.get("designId") as string;
    const designData = JSON.parse(formData.get("designData") as string);
    const shopifyCustomerId =
      (formData.get("shopifyCustomerId") as string) || null;

    let pdfUrl = "";
    const pdfFile = formData.get("pdf") as File;
    if (pdfFile && pdfFile.size > 0) {
      try {
        pdfUrl = await uploadPdfToDesignerBucket(
          def,
          pdfFile,
          def.pdfProofRelativePath(designId),
          "application/pdf",
        );
      } catch (e) {
        console.error("PDF upload failed:", e);
      }
    }

    const allBadges = designData.allBadges || [designData.badge];
    const orderItems = [];

    for (let i = 0; i < allBadges.length; i++) {
      const badge = allBadges[i];
      const thumbnailPngFile = formData.get(`thumbnail_png_${i}`) as File;
      const svgFile = formData.get(`svg_${i}`) as File;
      const printSvgFile = formData.get(`print_svg_${i}`) as File | null;

      let thumbnailUrl = "";
      let fullImageUrl = "";
      let printSvgUrl = "";

      if (thumbnailPngFile && thumbnailPngFile.size > 0) {
        try {
          const thumbName = `${designId}/${def.lineIdPrefix}-${i}-thumbnail.png`;
          thumbnailUrl = await uploadImageToDesignerBucket(
            def,
            thumbnailPngFile,
            thumbName,
            "image/png",
          );
        } catch (e) {
          console.error(`Thumbnail upload failed line ${i}:`, e);
        }
      }

      if (svgFile && svgFile.size > 0) {
        try {
          const svgName = `${designId}/${def.lineIdPrefix}-${i}-design.svg`;
          fullImageUrl = await uploadImageToDesignerBucket(
            def,
            svgFile,
            svgName,
            "image/svg+xml",
          );
        } catch (e) {
          console.error(`SVG upload failed line ${i}:`, e);
        }
      }

      if (printSvgFile && printSvgFile.size > 0) {
        try {
          const printSvgName = `${designId}/${def.lineIdPrefix}-${i}-print.svg`;
          printSvgUrl = await uploadImageToDesignerBucket(
            def,
            printSvgFile,
            printSvgName,
            "image/svg+xml",
          );
        } catch (e) {
          console.error(`Print SVG upload failed line ${i}:`, e);
        }
      }

      const item = convertBadgeToOrderItem(badge, designId, i, {
        thumbnail_url: thumbnailUrl,
        full_image_url: fullImageUrl,
        print_svg_url: printSvgUrl,
        pdf_url: pdfUrl,
        shopify_customer_id: shopifyCustomerId ?? undefined,
        lineIdPrefix: def.lineIdPrefix,
      });
      item.status = "draft";
      orderItems.push(item);
    }

    if (storageOnly) {
      let savedCount = 0;
      try {
        // Merge (do not delete-all first): a failed upsert after delete wiped every
        // line and caused the proof “support may contact you” alert. Merge also
        // keeps multi-item drafts intact when badge counts grow.
        await saveDraftDesignerOrderItemsMerge(def, designId, orderItems);
        savedCount = orderItems.length;
        try {
          await updateDesignerOrderItemsStatusByDesignId(def, designId, "in_cart");
        } catch (statusErr) {
          console.warn("in_cart status update failed:", statusErr);
        }
      } catch (saveErr) {
        console.error("storageOnly save failed:", saveErr);
        // Last resort: full replace via upsert (or insert fallback inside saver).
        try {
          await deleteDesignerOrderItemsByDesignId(def, designId);
          const saved = await saveDesignerOrderItems(def, orderItems);
          savedCount = Array.isArray(saved) ? saved.length : orderItems.length;
          try {
            await updateDesignerOrderItemsStatusByDesignId(
              def,
              designId,
              "in_cart",
            );
          } catch (statusErr) {
            console.warn("in_cart status update failed:", statusErr);
          }
        } catch (fallbackErr) {
          console.error("storageOnly fallback save failed:", fallbackErr);
          return json(
            {
              success: false,
              error: "Failed to save draft order items",
              message:
                "Files uploaded but draft rows could not be saved. Check Supabase and table.",
              details:
                fallbackErr instanceof Error
                  ? fallbackErr.message
                  : String(fallbackErr),
            },
            { status: 503 },
          );
        }
      }
      const hasAnyUploads =
        pdfUrl || orderItems.some((it) => it.thumbnail_url || it.full_image_url);
      return json({
        success: true,
        storageOnly: true,
        uploads: {
          pdf: !!pdfUrl,
          thumbnails: orderItems.some((i) => i.thumbnail_url),
          fullImages: orderItems.some((i) => i.full_image_url),
        },
        thumbnailUrls: orderItems.map((i) => i.thumbnail_url || ""),
        fullImageUrls: orderItems.map((i) => i.full_image_url || ""),
        pdfUrl: pdfUrl || undefined,
        savedDraftCount: savedCount,
        message: hasAnyUploads
          ? "Proof files uploaded and draft order items saved; order will be linked when paid"
          : "Draft order items saved",
      });
    }

    let savedItems = null;
    try {
      savedItems = await saveDesignerOrderItems(def, orderItems);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("fetch failed")
      ) {
        return json(
          {
            success: false,
            error:
              "Cannot connect to Supabase. Please check your network connection and Supabase configuration.",
            message:
              "Supabase connection failed. Files were generated but could not be uploaded.",
            warning: true,
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const hasAnyUploads =
      pdfUrl ||
      (savedItems &&
        savedItems.length > 0 &&
        (savedItems[0].thumbnail_url || savedItems[0].full_image_url));

    const lineCount = savedItems?.length || 0;
    return json({
      success: true,
      data: savedItems,
      badgeCount: lineCount,
      uploads: {
        pdf: !!pdfUrl,
        thumbnails: !!(savedItems?.[0]?.thumbnail_url),
        fullImages: !!(savedItems?.[0]?.full_image_url),
      },
      pdfUrl: pdfUrl || undefined,
      message: hasAnyUploads
        ? `Design uploaded successfully (${lineCount} line item(s) saved)`
        : "Design saved to database (file uploads failed)",
    });
  } catch (error) {
    console.error("Send to Supabase error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("fetch failed")
    ) {
      return json(
        {
          success: false,
          error:
            "Cannot connect to Supabase. Please check your network connection and Supabase configuration.",
          message: "Supabase connection failed",
        },
        { status: 503 },
      );
    }
    return json(
      {
        success: false,
        error: errorMessage,
        message: "Failed to upload design to Supabase",
      },
      { status: 500 },
    );
  }
}

function getSecretFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  const xHeader = request.headers.get("X-Link-Order-Secret");
  return xHeader?.trim() || null;
}

export async function runLinkPaidOrderToSupabase(
  designerId: DesignerId,
  request: Request,
): Promise<Response> {
  const def = getDesignerConfig(designerId);
  console.log(
    `${LOG_PREFIX} link-order (${designerId})`,
    new Date().toISOString(),
  );

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = resolveLinkOrderSecret(def);
  if (!secret) {
    return json(
      {
        error: "Server configuration error",
        message: "Link order secret not configured",
      },
      { status: 500 },
    );
  }

  const providedSecret = getSecretFromRequest(request);
  if (providedSecret !== secret) {
    return json(
      { error: "Unauthorized", message: "Invalid or missing link order secret" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      linkOrderBodySchema,
      body,
      "Invalid request body",
    );
    if (!parsed.ok) return parsed.response;
    const { shopifyOrderId, shopifyOrderNumber, shopifyCustomerId, lineItems } =
      parsed.data;

    const orderIdTrimmed = shopifyOrderId.trim();
    const orderNumberTrimmed =
      shopifyOrderNumber != null && shopifyOrderNumber !== ""
        ? String(shopifyOrderNumber).trim()
        : undefined;
    const customerIdTrimmed =
      shopifyCustomerId != null && shopifyCustomerId !== ""
        ? String(shopifyCustomerId).trim()
        : undefined;

    const updateLineItems: Array<{
      designId: string;
      badgeIndex: number;
      quantity: number;
    }> = [];

    for (const item of lineItems) {
      const rawId = item.designId ?? item.gadgetDesignId;
      const designId =
        rawId == null || rawId === ""
          ? ""
          : String(rawId).trim();
      if (!designId) continue;

      let idx =
        typeof item.badgeIndex === "number"
          ? item.badgeIndex
          : typeof item.badgeIndex === "string"
            ? parseInt(String(item.badgeIndex).trim(), 10)
            : NaN;
      if (Number.isNaN(idx) || idx < 0) idx = 0;

      const quantity =
        typeof item.quantity === "number" && item.quantity >= 1
          ? item.quantity
          : 1;
      updateLineItems.push({ designId, badgeIndex: idx, quantity });
    }

    if (updateLineItems.length === 0) {
      return json(
        {
          error: "Bad request",
          message:
            "No valid line items to update (missing designId or gadgetDesignId)",
        },
        { status: 400 },
      );
    }

    console.log(
      `${LOG_PREFIX} link-order (${designerId}) shopifyOrderId=${orderIdTrimmed} lines=${updateLineItems
        .map(
          (u) =>
            `${u.designId}[${def.lineIdPrefix}-${u.badgeIndex}]`,
        )
        .join(", ")}`,
    );

    const { data: updated } = await updateDraftDesignerOrderItemsWithOrderInfo(
      def,
      {
        lineItems: updateLineItems,
        shopifyOrderId: orderIdTrimmed,
        shopifyOrderNumber: orderNumberTrimmed,
        shopifyCustomerId: customerIdTrimmed,
      },
    );
    const updatedCount = Array.isArray(updated) ? updated.length : 0;

    if (updatedCount === 0) {
      console.warn(
        `${LOG_PREFIX} link-order (${designerId}) updatedCount=0 — no Supabase rows matched. Compare design_id + ${def.lineIdPrefix}-N + status in_cart|draft to cart line properties (Design ID, Sign/Badge Index).`,
      );
    } else {
      console.log(
        `${LOG_PREFIX} link-order (${designerId}) updatedCount=${updatedCount}`,
      );
    }

    const designIds = [
      ...new Set(
        lineItems
          .map((i) => {
            const v = i.designId ?? i.gadgetDesignId;
            if (v == null || v === "") return "";
            return String(v).trim();
          })
          .filter(Boolean),
      ),
    ] as string[];

    for (const designId of designIds) {
      try {
        const rows = await getDesignerOrderItemsByDesignId(def, designId);
        const designLineItems = lineItems.filter((i) => {
          const v = i.designId ?? i.gadgetDesignId;
          const id = v == null || v === "" ? "" : String(v).trim();
          return id === designId;
        });
        const orderSlipItems = designLineItems
          .map((i) => {
            const badgeIndex =
              typeof i.badgeIndex === "number"
                ? i.badgeIndex
                : parseInt(String(i.badgeIndex ?? 0).trim(), 10);
            const quantity =
              typeof i.quantity === "number" && i.quantity >= 1
                ? i.quantity
                : 1;
            const row = rows.find(
              (r) => r.badge_id === `${def.lineIdPrefix}-${badgeIndex}`,
            );
            return row ? { item: row, quantity } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x != null);
        if (orderSlipItems.length === 0) continue;

        for (const slipItem of orderSlipItems) {
          const badgeId = slipItem.item.badge_id ?? "";
          const idx =
            parseInt(badgeId.replace(new RegExp(`^${def.lineIdPrefix}-`), ""), 10) ||
            0;
          slipItem.imageBytes =
            (await downloadFromDesignerImageBucket(
              def,
              designId,
              `${def.lineIdPrefix}-${idx}-thumbnail.png`,
            )) ?? undefined;
        }

        const getImageBytes = async (url: string): Promise<Uint8Array | null> => {
          if (url.includes("/storage/v1/object/public/")) {
            const bytes = await downloadBytesFromStorageUrl(url);
            if (bytes) return bytes;
          }
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            const buf = await res.arrayBuffer();
            return new Uint8Array(buf);
          } catch {
            return null;
          }
        };

        const pdfBytes = await generateOrderSlipPdf(orderSlipItems, getImageBytes);
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        const uploadedUrl = await uploadPdfToDesignerBucket(
          def,
          pdfBlob,
          def.orderSlipPdfRelativePath(designId),
          "application/pdf",
        );
        const pdfUrl =
          uploadedUrl + (uploadedUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
        await updateDesignerPdfUrlByDesignId(def, designId, pdfUrl);
      } catch (slipErr) {
        console.warn(
          `${LOG_PREFIX} order-slip PDF failed design ${designId}:`,
          slipErr,
        );
      }
    }

    const libraryTable = getDesignLibraryTable(designerId);
    if (libraryTable) {
      for (const designId of designIds) {
        try {
          const snap = await insertOrderedDesignSnapshotFromCart({
            table: libraryTable,
            cartDesignId: designId,
            shopifyOrderId: orderIdTrimmed,
          });
          if (snap.skipped && snap.reason === "no_cart_snapshot") {
            console.log(
              `${LOG_PREFIX} link-order (${designerId}): no cart library row for design_id=${designId}, skip ordered snapshot`,
            );
          }
        } catch (snapErr) {
          console.warn(
            `${LOG_PREFIX} ordered design snapshot failed design ${designId}:`,
            snapErr,
          );
        }
      }
    }

    return json({
      success: true,
      updatedCount,
      message: `Updated ${updatedCount} draft order item(s) with order info`,
    });
  } catch (err) {
    console.error("Link order error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { error: "Failed to link order to Supabase", message },
      { status: 500 },
    );
  }
}
