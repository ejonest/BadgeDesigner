#!/usr/bin/env node
/**
 * Repoint thumbnail_url values at files that actually exist.
 *
 * After the PNG -> JPEG conversion some rows can still reference a .png that
 * was deleted (e.g. if the row update failed while the storage delete went
 * through). This finds every row whose thumbnail_url is missing from storage,
 * and rewrites it to the sibling .jpg/.webp/.png that is actually there.
 *
 *   node --env-file=.env scripts/repair-thumbnail-urls.mjs --dry-run
 *   node --env-file=.env scripts/repair-thumbnail-urls.mjs
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET_TABLES = [
  { bucket: "badge-images", table: "badge_order_items" },
  { bucket: "sign-images", table: "sign_order_items" },
  { bucket: "plaque-images", table: "plaque_order_items" },
  { bucket: "desk-sign-images", table: "desk_sign_order_items" },
  { bucket: "gavel-images", table: "gavel_order_items" },
];

const dryRun = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)");
  process.exit(1);
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

/** Every object path currently in the bucket, as a Set. */
async function bucketIndex(bucket) {
  const paths = new Set();
  const top = await listAll(bucket, "");
  for (const f of top.filter((i) => i.id)) paths.add(f.name);
  for (const folder of top.filter((i) => !i.id)) {
    const children = await listAll(bucket, folder.name);
    for (const c of children.filter((i) => i.id)) paths.add(`${folder.name}/${c.name}`);
  }
  return paths;
}

/** Turn a public storage URL into the object path inside the bucket. */
function pathFromUrl(publicUrl, bucket) {
  const marker = `/object/public/${bucket}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return null;
  return decodeURIComponent(publicUrl.slice(at + marker.length).split("?")[0]);
}

async function repair({ bucket, table }) {
  let rows;
  const { data, error } = await supabase
    .from(table)
    .select("id, design_id, thumbnail_url")
    .not("thumbnail_url", "is", null);
  if (error) {
    console.log(`${table}: skipped — ${error.message}`);
    return { fixed: 0, broken: 0 };
  }
  rows = data ?? [];

  const paths = await bucketIndex(bucket);
  let fixed = 0;
  let broken = 0;

  for (const row of rows) {
    const current = String(row.thumbnail_url || "");
    if (!current) continue;
    const path = pathFromUrl(current, bucket);
    if (!path || paths.has(path)) continue;

    const base = path.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    const replacement = [".jpg", ".png", ".webp", ".jpeg"]
      .map((ext) => `${base}${ext}`)
      .find((candidate) => paths.has(candidate));

    if (!replacement) {
      broken += 1;
      console.log(`  NO FILE  ${path}`);
      continue;
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(replacement);
    console.log(`  ${path}  ->  ${replacement}`);
    fixed += 1;

    if (dryRun) continue;
    const { error: updErr } = await supabase
      .from(table)
      .update({ thumbnail_url: pub.publicUrl })
      .eq("id", row.id);
    if (updErr) console.warn(`    update failed: ${updErr.message}`);
  }

  console.log(`${table}: ${fixed} repointed, ${broken} with no file at all\n`);
  return { fixed, broken };
}

async function main() {
  console.log(`dryRun=${dryRun}\n`);
  let fixed = 0;
  let broken = 0;
  for (const entry of BUCKET_TABLES) {
    try {
      const r = await repair(entry);
      fixed += r.fixed;
      broken += r.broken;
    } catch (err) {
      console.log(`${entry.table}: FAILED — ${err.message}`);
    }
  }
  console.log(`${dryRun ? "Would repoint" : "Repointed"} ${fixed} rows; ${broken} still have no file.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
