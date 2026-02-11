# Iframe and Gadget on_order_paid Setup (Multiple Badges)

## 1. New iframe setup (Shopify)

Use the full embed snippet so that **multiple badges** are added to the cart in one go. The script listens for `add-to-cart-multiple` and calls Shopify’s Cart API, then redirects to the cart.

### Option A: Use the snippet file

1. In your theme: **Online Store → Themes → Edit code**.
2. Under **Snippets**, click **Add a new snippet**. Name it `badge-designer-embed`.
3. Paste the full Liquid code below into the snippet and save.
4. On your product template (e.g. `product.liquid` or the template that shows the badge product), add where the designer should appear:
   ```liquid
   {% render 'badge-designer-embed' %}
   ```
5. Set `badge_designer_url` at the top of the snippet to your Vercel URL (e.g. `https://badgedesigner.vercel.app`).

### Option B: Inline in a section or template

If you prefer not to use a snippet, paste the **whole block** (container + iframe + script + style) into your product template or a custom section. Ensure the script runs on the same page as the iframe so the message listener is active.

### Full Liquid code (snippet or inline)

```liquid
{% comment %}
  Badge Designer Iframe Embed (multi-badge support)
  Usage: {% render 'badge-designer-embed' %} on product page
{% endcomment %}
{% assign badge_designer_url = 'https://badgedesigner.vercel.app' %}
{% assign v0 = product.variants[0] %}
{% assign v1 = product.variants[1] | default: v0 %}
{% assign v2 = product.variants[2] | default: v0 %}
<div style="width:100%; min-height:900px;">
  <iframe
    id="badge-designer-iframe"
    src="{{ badge_designer_url }}?shop={{ shop.permanent_domain | url_param_escape }}&storeUrl={{ shop.permanent_domain | url_param_escape }}&product={{ product.id | url_param_escape }}&variantIdPin={{ v0.id | url_param_escape }}&variantIdMagnetic={{ v1.id | url_param_escape }}&variantIdAdhesive={{ v2.id | url_param_escape }}{% if customer %}&customerId={{ customer.id | url_param_escape }}{% endif %}"
    style="width:100%; height:900px; border:0;"
    loading="lazy"
    allow="clipboard-read; clipboard-write"
  ></iframe>
</div>

<script>
  window.addEventListener('message', function(event) {
    if (event.origin !== '{{ badge_designer_url }}') return;
    var data = event.data;
    if (data.action === 'add-to-cart') {
      console.log('Add to cart received:', data.payload);
    }
    if (data.action === 'add-to-cart-multiple' && data.payload && Array.isArray(data.payload.items)) {
      var items = data.payload.items.map(function(item) {
        return { id: item.variantId, quantity: item.quantity || 1, properties: item.properties || {} };
      });
      var cartRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) ? window.Shopify.routes.root : '/';
      var cartAddUrl = cartRoot.replace(/\/$/, '') + '/cart/add.js';
      fetch(cartAddUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      })
        .then(function(res) { return res.json(); })
        .then(function() { window.location.href = cartRoot.replace(/\/$/, '') + '/cart'; })
        .catch(function(err) {
          console.error('Badge designer: cart/add.js failed', err);
          window.location.href = cartRoot.replace(/\/$/, '') + '/cart';
        });
    }
    if (data.action === 'design-saved') {
      console.log('Design saved:', data.payload);
    }
  });
</script>
```

**Important:** Replace `https://badgedesigner.vercel.app` with your actual Vercel app URL if different. The `event.origin` check must match that URL.

**Add to cart and Gadget:** At add-to-cart the designer sends minimal design data (line text, background color, backing type, design id) to Gadget so Gadget has the design for order-paid. It also sends `add-to-cart-multiple` (or redirects for a single item) so the **parent frame** adds items to the Shopify cart. If the designer is embedded in a **Gadget app page** (not the Shopify theme), the Gadget page must handle the `add-to-cart-multiple` message (e.g. redirect to the store’s `/cart/add` or call the store’s Cart API) so the cart is populated.

---

## 2. Gadget.dev on_order_paid action (TypeScript) with Badge Index

Use this in your Gadget **Global Action** (or equivalent) that runs on `orders/paid`. It includes **Badge Index** so Vercel creates one Supabase row per cart line for multi-badge orders.

- **Trigger:** Shopify webhook `orders/paid`.
- **Env vars:** `VERCEL_LINK_ORDER_URL`, `LINK_ORDER_SECRET`.

Replace your existing `on_order_paid` action code with the following (or merge the `badgeIndex` logic into your current `getLineItemsWithDesignData` and keep the rest of your helpers).

```typescript
import { ActionOptions } from "gadget-server";

const LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_URL ||
  "https://badgedesigner.vercel.app/api/link-order-to-supabase";
const LINK_ORDER_SECRET = process.env.LINK_ORDER_SECRET;

function getPropertiesMap(lineItem: any): Record<string, any> {
  const props = lineItem?.properties || lineItem?.customAttributes || [];
  if (!Array.isArray(props)) return {};
  return props.reduce((acc: Record<string, any>, p: any) => {
    const name = p?.name ?? p?.key;
    const value = p?.value;
    if (name != null) acc[name] = value;
    return acc;
  }, {});
}

function safeJsonParse<T>(value: unknown, fallback: T, logger?: any, context?: any): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch (e: any) {
    if (logger) {
      logger.warn(
        `on_order_paid: JSON.parse failed ${context ? JSON.stringify(context) : ""} error=${e?.message}`
      );
    }
    return fallback;
  }
}

function flattenBadgeDesign(design: any, logger?: any): Record<string, any> {
  const flattened: Record<string, any> = {
    design_id: design?.designId || null,
    background_color: design?.backgroundColor || null,
  };

  let textLines = safeJsonParse<any[]>(design?.textLines, [], logger, { field: "textLines", pk: design?.id });

  if ((!Array.isArray(textLines) || textLines.length === 0) && design?.designData) {
    const designData = safeJsonParse<any>(design.designData, null as any, logger, {
      field: "designData",
      pk: design?.id,
    });
    const tl = designData?.allBadges?.[0]?.textLines;
    if (Array.isArray(tl)) textLines = tl;
  }

  for (let i = 0; i < 4; i++) {
    const lineNum = i + 1;
    const line = Array.isArray(textLines) ? textLines[i] : undefined;
    flattened[`line_${lineNum}_text`] = line?.text || null;
    flattened[`line_${lineNum}_font`] = line?.font || null;
    flattened[`line_${lineNum}_bold`] = line?.bold ?? null;
    flattened[`line_${lineNum}_underline`] = line?.underline ?? null;
    flattened[`line_${lineNum}_italicize`] = line?.italicize ?? null;
    flattened[`line_${lineNum}_color`] = line?.color || null;
    flattened[`line_${lineNum}_alignment`] = line?.alignment || null;
    flattened[`line_${lineNum}_font_size`] = line?.fontSize || null;
  }

  if (design?.designData) {
    const designData = safeJsonParse<any>(design.designData, null as any, logger, {
      field: "designData",
      pk: design?.id,
    });
    flattened.thumbnail_url = designData?.thumbnail_url || designData?.thumbnailUrl || null;
    flattened.full_image_url = designData?.full_image_url || designData?.fullImageUrl || null;
    flattened.pdf_url = designData?.pdf_url || designData?.pdfUrl || null;
  }

  return flattened;
}

async function findBadgeDesignByDesignId(model: any, designId: string, selectAll: any): Promise<any | null> {
  const res = await model.findMany({
    filter: { designId: { equals: designId } },
    first: 1,
    select: selectAll,
  });
  if (Array.isArray(res) && res.length > 0) return res[0];
  return null;
}

async function getLineItemsWithDesignData(order: any, api: any, logger: any): Promise<any[]> {
  const lineItems = order?.line_items ?? order?.lineItems ?? [];
  const payloadLineItems: any[] = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(item);

    const designIdRaw =
      props["Design ID"] ?? props["DesignId"] ?? props["designId"] ?? props["design_id"];
    const gadgetDesignIdRaw =
      props["Gadget Design ID"] ??
      props["GadgetDesignId"] ??
      props["gadgetDesignId"] ??
      props["gadget_design_id"];

    const designId = designIdRaw != null ? String(designIdRaw).trim() : null;
    const gadgetDesignId = gadgetDesignIdRaw != null ? String(gadgetDesignIdRaw).trim() : undefined;

    if (!designId && !gadgetDesignId) continue;

    // Badge Index: which badge in the design this line item represents (for multi-badge → one row per line)
    const badgeIndexRaw = props["Badge Index"];
    const badgeIndexParsed =
      badgeIndexRaw !== undefined && badgeIndexRaw !== null && badgeIndexRaw !== ""
        ? parseInt(String(badgeIndexRaw).trim(), 10)
        : undefined;
    const badgeIndex = badgeIndexParsed !== undefined && !Number.isNaN(badgeIndexParsed) ? badgeIndexParsed : undefined;

    const entry: any = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
      badgeIndex,
    };

    const model = api?.badgeDesign || api?.BadgeDesign;
    if (!model) {
      payloadLineItems.push(entry);
      continue;
    }

    const selectAll = {
      id: true,
      designId: true,
      designData: true,
      textLines: true,
      backgroundColor: true,
      backingPrice: true,
      backingType: true,
      basePrice: true,
      productId: true,
      shopId: true,
      status: true,
      totalPrice: true,
      createdAt: true,
      updatedAt: true,
    };

    let design: any | null = null;

    if (gadgetDesignId) {
      try {
        design = await model.findOne(gadgetDesignId, { select: selectAll });
      } catch (e: any) {
        logger.warn(`on_order_paid: findOne(gadgetDesignId) failed ${JSON.stringify({ gadgetDesignId, error: e?.message })}`);
      }
    }

    if (!design && designId) {
      try {
        design = await findBadgeDesignByDesignId(model, designId, selectAll);
      } catch (e: any) {
        logger.warn(`on_order_paid: findMany(filter designId) failed ${JSON.stringify({ designId, error: e?.message })}`);
      }
    }

    if (design) {
      entry.designData = safeJsonParse<any>(design.designData, null as any, logger, {
        field: "designData",
        pk: design?.id,
      });
      const flattened = flattenBadgeDesign(design, logger);
      Object.assign(entry, flattened);
    } else {
      logger.warn(`on_order_paid: BadgeDesign not found ${JSON.stringify({ designId, gadgetDesignId })}`);
    }

    payloadLineItems.push(entry);
  }

  return payloadLineItems;
}

export const options: ActionOptions = {
  triggers: {
    shopify: { webhooks: ["orders/paid"] },
  },
};

function extractOrder(ctx: any): any | null {
  return (
    ctx?.record ??
    ctx?.trigger?.order ??
    ctx?.trigger?.payload?.order ??
    ctx?.params?.order ??
    ctx?.params?.payload?.order ??
    ctx?.params ??
    null
  );
}

export const run = async (ctx: any) => {
  const { api, logger } = ctx;
  const order = extractOrder(ctx);

  if (!order) {
    logger.warn("on_order_paid: no order in params/trigger/record");
    return { success: false, reason: "no_order" };
  }

  const shopifyOrderId = order.id ?? order.shopifyId ?? order.admin_graphql_api_id;
  const shopifyOrderNumber = order.name ?? order.order_number;
  const shopifyCustomerId = order.customer_id ?? order.customer?.id ?? order.customerId ?? null;

  if (!shopifyOrderId) {
    logger.warn("on_order_paid: order has no id");
    return { success: false, reason: "no_order_id" };
  }

  const payloadLineItems = await getLineItemsWithDesignData(order, api, logger);
  if (payloadLineItems.length === 0) {
    logger.info("on_order_paid: no badge line items (no Design ID), skipping");
    return { success: true, skipped: true, reason: "no_badge_items" };
  }

  if (!LINK_ORDER_SECRET) {
    logger.error("on_order_paid: LINK_ORDER_SECRET not set");
    return { success: false, reason: "missing_secret" };
  }

  const body = {
    shopifyOrderId: String(shopifyOrderId),
    shopifyOrderNumber: shopifyOrderNumber != null ? String(shopifyOrderNumber) : undefined,
    shopifyCustomerId: shopifyCustomerId != null ? String(shopifyCustomerId) : undefined,
    lineItems: payloadLineItems,
  };

  try {
    const res = await fetch(LINK_ORDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINK_ORDER_SECRET}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      logger.error(`on_order_paid: Vercel API error ${JSON.stringify({ status: res.status, data })}`);
      return { success: false, status: res.status, error: (data as any)?.message ?? (data as any)?.error };
    }

    logger.info(`on_order_paid: linked order to Supabase ${JSON.stringify({ insertedCount: (data as any)?.insertedCount })}`);
    return { success: true, insertedCount: (data as any)?.insertedCount, data };
  } catch (err: any) {
    logger.error(`on_order_paid: fetch failed ${JSON.stringify({ error: err?.message })}`);
    return { success: false, error: err?.message };
  }
};
```

**Note:** If your Gadget action uses a different export (e.g. `ActionRun` type), keep your existing `export const run` signature and only ensure `getLineItemsWithDesignData` builds each `entry` with `designId`, `gadgetDesignId`, and **`badgeIndex`** (parsed from `props["Badge Index"]`) so Vercel receives it.
