#!/usr/bin/env node
/**
 * Read-only inventory of Supabase Storage: what is actually taking up space.
 *
 * Reports per bucket: file count, total bytes, how much is orphaned (folder no
 * longer referenced by that designer's order-items table), and the oldest /
 * newest file dates. Deletes nothing.
 *
 *   node --env-file=.env scripts/inspect-supabase-storage.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** bucket -> table that owns its design_* folders (null = unknown/no mapping) */
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
  "stamp-images": null,
  "stamp-pdfs": null,
  "nameplate-images": null,
  "nameplate-pdfs": null,
};

const mb = (b) => (b / (1024 * 1024)).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Storage rate-limits with a 429 partway through a full walk, so back off. */
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

async function designIdsFor(table) {
  if (!table) return null;
  const ids = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("design_id")
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn(`  (could not read ${table}: ${error.message})`);
      return null;
    }
    if (!data?.length) break;
    for (const r of data) if (r.design_id) ids.add(r.design_id);
    if (data.length < pageSize) break;
  }
  return ids;
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  console.log(`Buckets: ${buckets.map((b) => b.name).join(", ")}\n`);

  const summary = [];
  let grandBytes = 0;

  for (const b of buckets) {
    const bucket = b.name;
    const owner =
      bucket in BUCKET_OWNER_TABLE ? BUCKET_OWNER_TABLE[bucket] : undefined;
    const keep = owner === undefined ? null : await designIdsFor(owner);

    let files = 0;
    let bytes = 0;
    let orphanFiles = 0;
    let orphanBytes = 0;
    let oldest = null;
    let newest = null;
    const folderBytes = new Map();

    const top = await listAll(bucket, "");
    const rootFiles = top.filter((i) => i.id);
    const folders = top.filter((i) => !i.id);

    const tally = (name, item, folderKey) => {
      const size = Number(item.metadata?.size || 0);
      files += 1;
      bytes += size;
      const created = item.created_at || item.updated_at;
      if (created) {
        if (!oldest || created < oldest) oldest = created;
        if (!newest || created > newest) newest = created;
      }
      folderBytes.set(folderKey, (folderBytes.get(folderKey) || 0) + size);
      if (keep && folderKey.startsWith("design_") && !keep.has(folderKey)) {
        orphanFiles += 1;
        orphanBytes += size;
      }
    };

    for (const f of rootFiles) tally(f.name, f, String(f.name).split("/")[0]);
    for (const folder of folders) {
      const children = await listAll(bucket, folder.name);
      for (const c of children.filter((i) => i.id)) tally(c.name, c, folder.name);
    }

    grandBytes += bytes;
    const top5 = [...folderBytes.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k} (${mb(v)} MB)`);

    summary.push({ bucket, files, bytes, orphanFiles, orphanBytes });

    console.log(`${bucket}`);
    console.log(`  files: ${files}   size: ${mb(bytes)} MB`);
    if (keep) {
      console.log(
        `  orphaned (folder not in ${owner}): ${orphanFiles} files, ${mb(orphanBytes)} MB`,
      );
    } else if (owner === null) {
      console.log("  (no owner table mapping — not orphan-checked)");
    }
    if (oldest) console.log(`  oldest: ${oldest}   newest: ${newest}`);
    if (top5.length) console.log(`  biggest folders: ${top5.join(", ")}`);
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`TOTAL across buckets: ${mb(grandBytes)} MB`);
  const totalOrphan = summary.reduce((s, r) => s + r.orphanBytes, 0);
  console.log(`Reclaimable (orphaned, any date): ${mb(totalOrphan)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
