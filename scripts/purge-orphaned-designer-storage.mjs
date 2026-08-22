#!/usr/bin/env node
/**
 * Delete orphaned design files from every designer storage bucket.
 *
 * A design_* folder is orphaned when no row in that designer's order-items
 * table references its design_id, i.e. nothing in the app can reach those
 * files any more. Unlike the one-off purge-orphaned-badge-storage.mjs, this
 * covers all buckets and all dates.
 *
 *   node --env-file=.env scripts/purge-orphaned-designer-storage.mjs --dry-run
 *   node --env-file=.env scripts/purge-orphaned-designer-storage.mjs
 *
 * Options:
 *   --dry-run              list what would go, delete nothing
 *   --min-age-days=<n>     skip files newer than n days (default 7), so a
 *                          draft that hasn't been saved yet is never caught
 *   --bucket=<name>        limit to one bucket, repeatable
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Every bucket must be listed here. A bucket with no owner table is skipped
 * rather than purged, so a new designer can't be wiped by accident.
 */
const BUCKET_OWNER_TABLE = {
  "badge-images": "badge_order_items",
  "badge-pdfs": "badge_order_items",
  "sign-images": "sign_order_items",
  "sign-pdfs": "sign_order_items",
  "plaque-images": "plaque_order_items",
  "plaque-pdfs": "plaque_order_items",
  "desk-sign-images": "desk_sign_order_items",
  "desk-sign-pdfs": "desk_sign_order_items",
  "gavel-images": "gavel_order_items",
  "gavel-pdfs": "gavel_order_items",
};

const ALWAYS_KEEP = new Set(["design_1786625374290_k2gqcwidk"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const minAgeDays = Number(
  (args.find((a) => a.startsWith("--min-age-days=")) || "=7").split("=")[1],
);
const bucketFilter = args
  .filter((a) => a.startsWith("--bucket="))
  .map((a) => a.split("=")[1]);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cutoffMs = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
const mb = (b) => (b / (1024 * 1024)).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function oldEnough(createdAt) {
  if (!createdAt) return false;
  return Date.parse(createdAt) < cutoffMs;
}

/** Storage rate-limits with a 429 well before the work is done, so back off. */
async function withRetry(label, fn, attempts = 6) {
  let wait = 1000;
  for (let i = 1; ; i += 1) {
    const { data, error } = await fn();
    if (!error) return data;
    if (i >= attempts || error.status !== 429) throw error;
    process.stdout.write(`\n  ${label}: rate limited, retrying in ${wait / 1000}s`);
    await sleep(wait);
    wait *= 2;
  }
}

async function listAll(bucket, prefix) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const data = await withRetry(`list ${bucket}`, () =>
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

async function referencedDesignIds(table) {
  const ids = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("design_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`reading ${table}: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) if (row.design_id) ids.add(row.design_id);
    if (data.length < pageSize) break;
  }
  return ids;
}

async function purgeBucket(bucket, table) {
  let keep;
  try {
    keep = await referencedDesignIds(table);
  } catch (err) {
    console.log(`${bucket}: SKIPPED — ${err.message}`);
    return { files: 0, bytes: 0 };
  }
  for (const id of ALWAYS_KEEP) keep.add(id);

  const top = await listAll(bucket, "");
  const toRemove = [];
  let bytes = 0;

  const consider = (path, item) => {
    const folder = path.split("/")[0];
    if (!folder.startsWith("design_")) return;
    if (keep.has(folder)) return;
    if (!oldEnough(item.created_at || item.updated_at)) return;
    toRemove.push(path);
    bytes += Number(item.metadata?.size || 0);
  };

  for (const file of top.filter((i) => i.id)) consider(file.name, file);
  for (const folder of top.filter((i) => !i.id)) {
    if (keep.has(folder.name)) continue;
    const children = await listAll(bucket, folder.name);
    for (const child of children.filter((i) => i.id)) {
      consider(`${folder.name}/${child.name}`, child);
    }
  }

  console.log(
    `${bucket}: ${toRemove.length} orphaned files (~${mb(bytes)} MB), ${keep.size} folders kept`,
  );
  if (toRemove.length && dryRun) {
    console.log(`  ${toRemove.slice(0, 5).join("\n  ")}`);
    if (toRemove.length > 5) console.log(`  … +${toRemove.length - 5} more`);
  }

  if (!dryRun && toRemove.length) {
    const chunk = 50;
    for (let i = 0; i < toRemove.length; i += chunk) {
      const slice = toRemove.slice(i, i + chunk);
      await withRetry(`remove ${bucket}`, () =>
        supabase.storage.from(bucket).remove(slice),
      );
      process.stdout.write(
        `  removed ${Math.min(i + chunk, toRemove.length)}/${toRemove.length}\r`,
      );
      await sleep(400);
    }
    console.log("");
  }

  return { files: toRemove.length, bytes };
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  console.log(
    `dryRun=${dryRun}  minAgeDays=${minAgeDays} (skipping files newer than ${new Date(cutoffMs).toISOString()})\n`,
  );

  let totalFiles = 0;
  let totalBytes = 0;

  for (const b of buckets) {
    if (bucketFilter.length && !bucketFilter.includes(b.name)) continue;
    const table = BUCKET_OWNER_TABLE[b.name];
    if (!table) {
      console.log(`${b.name}: SKIPPED — no owner table mapped in this script`);
      continue;
    }
    try {
      const result = await purgeBucket(b.name, table);
      totalFiles += result.files;
      totalBytes += result.bytes;
    } catch (err) {
      console.log(`\n${b.name}: FAILED — ${err.message} (re-run to finish)`);
    }
    await sleep(1000);
  }

  console.log(
    `\n${dryRun ? "Would delete" : "Deleted"} ${totalFiles} files (~${mb(totalBytes)} MB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
