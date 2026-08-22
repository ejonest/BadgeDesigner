#!/usr/bin/env node
/**
 * Reconcile "what Supabase bills us for" against "what our bucket walk sees".
 *
 * inspect-supabase-storage.mjs and the purge script only descend one level, so
 * anything nested deeper (e.g. design_x/logos/foo.png) is invisible to them and
 * never gets cleaned up. This walks every bucket to full depth and reports the
 * real totals, plus a size histogram so the space hogs are obvious.
 *
 *   node --env-file=.env scripts/storage-usage-audit.mjs
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

const mb = (b) => (b / (1024 * 1024)).toFixed(1);
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

async function listPage(bucket, prefix) {
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

/** Recursive walk. Supabase marks folders by returning a null id. */
async function walk(bucket, prefix, depth, onFile) {
  const entries = await listPage(bucket, prefix);
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) onFile(path, entry, depth);
    else if (depth < 6) await walk(bucket, path, depth + 1, onFile);
  }
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  let totalFiles = 0;
  let totalBytes = 0;
  const deep = [];
  const biggest = [];

  for (const b of buckets) {
    let files = 0;
    let bytes = 0;
    let maxDepth = 1;

    await walk(b.name, "", 1, (path, entry, depth) => {
      const size = Number(entry.metadata?.size || 0);
      files += 1;
      bytes += size;
      if (depth > maxDepth) maxDepth = depth;
      if (depth > 2) deep.push(`${b.name}/${path}`);
      biggest.push({ path: `${b.name}/${path}`, size });
    });

    totalFiles += files;
    totalBytes += bytes;
    console.log(
      `${b.name.padEnd(20)} ${String(files).padStart(6)} files  ${mb(bytes).padStart(9)} MB  maxDepth=${maxDepth}`,
    );
    await sleep(300);
  }

  console.log(
    `\nTOTAL${"".padEnd(15)} ${String(totalFiles).padStart(6)} files  ${mb(totalBytes).padStart(9)} MB`,
  );

  if (deep.length) {
    console.log(`\nNested deeper than one level (purge script misses these): ${deep.length}`);
    for (const p of deep.slice(0, 10)) console.log(`  ${p}`);
    if (deep.length > 10) console.log(`  … +${deep.length - 10} more`);
  } else {
    console.log("\nNo files nested deeper than one level — the purge script sees everything.");
  }

  biggest.sort((a, b) => b.size - a.size);
  console.log("\n20 largest individual files:");
  for (const f of biggest.slice(0, 20)) {
    console.log(`  ${mb(f.size).padStart(8)} MB  ${f.path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
