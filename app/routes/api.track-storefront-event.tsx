import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  parseOr400,
  trackStorefrontEventBodySchema,
} from "~/utils/validation";
import { supabaseAdmin } from "~/utils/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function response(body: Record<string, unknown>, status = 200) {
  return json(body, { status, headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      trackStorefrontEventBodySchema,
      body,
      "Invalid request body",
    );

    if (!parsed.ok) {
      const headers = new Headers(parsed.response.headers);
      for (const [name, value] of Object.entries(corsHeaders)) {
        headers.set(name, value);
      }
      return new Response(parsed.response.body, {
        status: parsed.response.status,
        headers,
      });
    }

    if (!supabaseAdmin) {
      return response({ ok: true, stored: false });
    }

    const row = parsed.data;
    const { error } = await supabaseAdmin.from("storefront_events").upsert(
      {
        event_id: row.event_id,
        client_id: row.client_id,
        event_name: row.event_name,
        occurred_at: row.occurred_at,
        page_path: row.page_path ?? null,
        referrer_host: row.referrer_host ?? null,
        referrer_path: row.referrer_path ?? null,
        utm_source: row.utm_source ?? null,
        utm_medium: row.utm_medium ?? null,
        utm_campaign: row.utm_campaign ?? null,
        product_id: row.product_id ?? null,
        variant_id: row.variant_id ?? null,
        cart_id: row.cart_id ?? null,
        checkout_token: row.checkout_token ?? null,
        order_id: row.order_id ?? null,
        currency: row.currency ?? null,
        value: row.value ?? null,
        item_count: row.item_count ?? null,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );

    if (error) {
      console.warn("[track-storefront-event] insert failed:", error.message);
      return response({ ok: true, stored: false });
    }

    return response({ ok: true, stored: true });
  } catch (error) {
    console.warn("[track-storefront-event]", error);
    return response({ ok: true, stored: false });
  }
}
