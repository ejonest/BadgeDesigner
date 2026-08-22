/**
 * Read-only check of the most recent gavel rows, to tell an add-to-cart
 * failure apart from a checkout-linking failure.
 *
 * Usage: node scripts/inspect-gavel-order-items.mjs
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  const out = {};
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

async function q(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { error: `${res.status} ${await res.text()}` };
  return { rows: await res.json() };
}

for (const table of ["gavel_order_items", "gavel_designs"]) {
  const r = await q(`${table}?select=*&order=created_at.desc&limit=8`);
  console.log(`\n===== ${table} =====`);
  if (r.error) { console.log("ERROR:", r.error); continue; }
  if (!r.rows.length) { console.log("(no rows)"); continue; }
  for (const row of r.rows) {
    console.log(
      JSON.stringify({
        created_at: row.created_at,
        design_id: row.design_id,
        gavel_id: row.gavel_id,
        status: row.status,
        shopify_order_id: row.shopify_order_id ?? null,
        shopify_order_number: row.shopify_order_number ?? null,
        shopify_customer_id: row.shopify_customer_id ?? null,
        shop_id: row.shop_id ?? null,
        has_data_json: row.data_json != null,
        thumbnail: row.thumbnail_url ? "yes" : "no",
        print_svg: row.print_svg_url ? "yes" : "no",
        pdf: row.pdf_url ? "yes" : "no",
      }),
    );
  }
}
