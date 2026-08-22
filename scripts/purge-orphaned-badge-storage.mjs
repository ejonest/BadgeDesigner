#!/usr/bin/env node
/**
 * Delete Playwright leftover files from badge-images / badge-pdfs.
 *
 * Keeps any design_* folder that still has a badge_order_items row
 * (including Madison / #1096). Only touches files created in the
 * Aug 13–14 2026 UTC window by default.
 *
 *   node --env-file=.env scripts/purge-orphaned-badge-storage.mjs --dry-run
 *   node --env-file=.env scripts/purge-orphaned-badge-storage.mjs
 */

import { createClient } from "@supabase/supabase-js";

const FROM = process.env.QA_STORAGE_FROM || "2026-08-13T00:00:00.000Z";
const UNTIL = process.env.QA_STORAGE_UNTIL || "2026-08-15T00:00:00.000Z";
const BUCKETS = ["badge-images", "badge-pdfs"];
const ALWAYS_KEEP = new Set(["design_1786625374290_k2gqcwidk"]);
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

const fromMs = Date.parse(FROM);
const untilMs = Date.parse(UNTIL);

function inWindow(createdAt) {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return t >= fromMs && t < untilMs;
}

async function listAll(bucket, prefix) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("badge_order_items")
    .select("design_id");
  if (error) throw error;

  const keep = new Set(ALWAYS_KEEP);
  for (const row of rows ?? []) {
    if (row.design_id) keep.add(row.design_id);
  }
  console.log(`Keeping ${keep.size} design folders still referenced by badge_order_items`);
  console.log(`Window: ${FROM} .. ${UNTIL}  dryRun=${dryRun}`);

  let totalFiles = 0;
  let totalBytes = 0;

  for (const bucket of BUCKETS) {
    const top = await listAll(bucket, "");
    const folders = top.filter(
      (item) => !item.id && String(item.name || "").startsWith("design_"),
    );
    const filesAtRoot = top.filter((item) => item.id);

    const toRemove = [];

    for (const file of filesAtRoot) {
      const folder = String(file.name).split("/")[0];
      if (
        folder.startsWith("design_") &&
        !keep.has(folder) &&
        inWindow(file.created_at)
      ) {
        toRemove.push(file.name);
        totalBytes += Number(file.metadata?.size || 0);
      }
    }

    for (const folder of folders) {
      if (keep.has(folder.name)) continue;
      const children = await listAll(bucket, folder.name);
      const doomed = children.filter(
        (item) => item.id && inWindow(item.created_at),
      );
      for (const file of doomed) {
        toRemove.push(`${folder.name}/${file.name}`);
        totalBytes += Number(file.metadata?.size || 0);
      }
    }

    console.log(`\n${bucket}: ${toRemove.length} files`);
    if (toRemove.length && dryRun) {
      console.log(toRemove.slice(0, 8).join("\n"));
      if (toRemove.length > 8) console.log(`… +${toRemove.length - 8} more`);
    }

    if (!dryRun && toRemove.length) {
      const chunk = 100;
      for (let i = 0; i < toRemove.length; i += chunk) {
        const slice = toRemove.slice(i, i + chunk);
        const { error: rmErr } = await supabase.storage.from(bucket).remove(slice);
        if (rmErr) throw rmErr;
        process.stdout.write(`  removed ${Math.min(i + chunk, toRemove.length)}/${toRemove.length}\r`);
      }
      console.log("");
    }

    totalFiles += toRemove.length;
  }

  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(
    `\n${dryRun ? "Would delete" : "Deleted"} ${totalFiles} files (~${mb} MB metadata size)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
