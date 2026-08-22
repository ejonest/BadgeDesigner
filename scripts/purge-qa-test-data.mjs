#!/usr/bin/env node
/**
 * Delete everything a QA run created: is_qa_test rows plus their storage files.
 *
 * Playwright opens the designer with ?qaTest=1, which marks every row it writes
 * with is_qa_test = true. This removes those rows and the images/PDFs uploaded
 * under their design_ids, so a test run leaves nothing behind.
 *
 * Rows carrying a shopify_order_id are never touched, so a mis-set flag on a
 * real order can't delete customer data.
 *
 *   node --env-file=.env scripts/purge-qa-test-data.mjs --dry-run
 *   node --env-file=.env scripts/purge-qa-test-data.mjs
 *
 * Requires the is_qa_test column (docs/migration_add_is_qa_test_to_order_items.sql).
 * Tables without it are reported and skipped rather than guessed at.
 */

import { createClient } from "@supabase/supabase-js";

const DESIGNERS = [
  { table: "badge_order_items", buckets: ["badge-images", "badge-pdfs"] },
  { table: "sign_order_items", buckets: ["sign-images", "sign-pdfs"] },
  { table: "plaque_order_items", buckets: ["plaque-images", "plaque-pdfs"] },
  { table: "desk_sign_order_items", buckets: ["desk-sign-images", "desk-sign-pdfs"] },
  { table: "gavel_order_items", buckets: ["gavel-images", "gavel-pdfs"] },
];

const dryRun = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  // Not an error: CI runs the suite without Supabase credentials, and in that
  // case the app never uploaded anything to clean up.
  console.log("No Supabase credentials set — nothing was uploaded, nothing to purge.");
  process.exit(0);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, attempts = 6) {
  let wait = 1000;
  for (let i = 1; ; i += 1) {
    const { data, error } = await fn();
    if (!error) return data;
    if (i >= attempts || error.status !== 429) throw error;
    await sleep(wait);
    wait *= 2;
  }
}

async function listAll(bucket, prefix) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const data = await withRetry(() =>
      supabase.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    );
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

async function purgeDesigner({ table, buckets }) {
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, design_id")
    .eq("is_qa_test", true)
    .is("shopify_order_id", null);

  if (error) {
    if (/is_qa_test/.test(error.message)) {
      console.log(`${table}: skipped — no is_qa_test column (run the migration)`);
    } else if (/schema cache|does not exist/.test(error.message)) {
      console.log(`${table}: skipped — table not present`);
    } else {
      console.log(`${table}: skipped — ${error.message}`);
    }
    return { rows: 0, files: 0 };
  }

  if (!rows?.length) {
    console.log(`${table}: nothing to purge`);
    return { rows: 0, files: 0 };
  }

  const designIds = [...new Set(rows.map((r) => r.design_id).filter(Boolean))];
  console.log(`${table}: ${rows.length} QA rows across ${designIds.length} designs`);

  let files = 0;
  for (const bucket of buckets) {
    const paths = [];
    for (const designId of designIds) {
      let children;
      try {
        children = await listAll(bucket, designId);
      } catch {
        continue;
      }
      for (const c of children.filter((i) => i.id)) paths.push(`${designId}/${c.name}`);
    }
    if (!paths.length) continue;
    files += paths.length;
    console.log(`  ${bucket}: ${paths.length} files`);
    if (dryRun) continue;

    const chunk = 50;
    for (let i = 0; i < paths.length; i += chunk) {
      await withRetry(() => supabase.storage.from(bucket).remove(paths.slice(i, i + chunk)));
      await sleep(200);
    }
  }

  if (!dryRun) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq("is_qa_test", true)
      .is("shopify_order_id", null);
    if (delErr) console.warn(`  row delete failed: ${delErr.message}`);
  }

  return { rows: rows.length, files };
}

async function main() {
  console.log(`dryRun=${dryRun}\n`);
  let rows = 0;
  let files = 0;
  for (const designer of DESIGNERS) {
    try {
      const r = await purgeDesigner(designer);
      rows += r.rows;
      files += r.files;
    } catch (err) {
      console.log(`${designer.table}: FAILED — ${err.message}`);
    }
  }
  console.log(
    `\n${dryRun ? "Would remove" : "Removed"} ${rows} QA rows and ${files} files.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
