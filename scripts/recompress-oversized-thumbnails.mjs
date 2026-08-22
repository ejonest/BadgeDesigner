#!/usr/bin/env node
/**
 * Re-encode oversized PNG thumbnails as JPEG and repoint the database at them.
 *
 * The legacy designer rasterised thumbnails as full-scale PNG, which produced
 * 5-6 MB files for something displayed at a few hundred pixels. New uploads are
 * JPEG now (DRAFT_FULL_BADGE_IMAGE_OPTIONS); this fixes the ones already stored.
 *
 * For each oversized thumbnail it: downloads the PNG, flattens it onto white
 * (JPEG has no alpha), resizes to fit MAX_EDGE, encodes as JPEG, uploads the
 * .jpg alongside, updates the order-items row's thumbnail_url, then deletes the
 * PNG. If the re-encode does not actually save space the file is left alone.
 *
 *   node --env-file=.env scripts/recompress-oversized-thumbnails.mjs --dry-run
 *   node --env-file=.env scripts/recompress-oversized-thumbnails.mjs
 *
 * Options:
 *   --dry-run           report what would change, write nothing
 *   --min-kb=<n>        only touch PNGs larger than this (default 300)
 *   --bucket=<name>     limit to one bucket, repeatable
 *   --keep-png          upload the .jpg but do not delete the original
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * bucket -> order-items table whose thumbnail_url needs repointing.
 * Rows are matched on design_id plus the old URL, because the per-line id
 * column is named differently in every table (badge_id, sign_id, plaque_id…).
 */
const BUCKET_OWNER = {
  "badge-images": { table: "badge_order_items" },
  "sign-images": { table: "sign_order_items" },
  "plaque-images": { table: "plaque_order_items" },
  "desk-sign-images": { table: "desk_sign_order_items" },
  "gavel-images": { table: "gavel_order_items" },
};

const MAX_EDGE = 1400;
const JPEG_QUALITY = 85;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keepPng = args.includes("--keep-png");
const minBytes =
  Number((args.find((a) => a.startsWith("--min-kb=")) || "=300").split("=")[1]) * 1024;
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

const mb = (b) => (b / (1024 * 1024)).toFixed(1);
const kb = (b) => (b / 1024).toFixed(0);
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

async function processBucket(bucket, owner) {
  const folders = (await listAll(bucket, "")).filter(
    (i) => !i.id && String(i.name).startsWith("design_"),
  );

  let converted = 0;
  let before = 0;
  let after = 0;
  let skipped = 0;

  for (const folder of folders) {
    const children = await listAll(bucket, folder.name);
    const targets = children.filter(
      (c) =>
        c.id &&
        /-thumbnail\.png$/i.test(c.name) &&
        Number(c.metadata?.size || 0) > minBytes,
    );

    for (const file of targets) {
      const path = `${folder.name}/${file.name}`;
      const originalSize = Number(file.metadata?.size || 0);

      const blob = await withRetry(() => supabase.storage.from(bucket).download(path));
      const input = Buffer.from(await blob.arrayBuffer());

      const output = await sharp(input)
        .flatten({ background: "#ffffff" })
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      if (output.length >= originalSize) {
        skipped += 1;
        continue;
      }

      const jpgPath = path.replace(/\.png$/i, ".jpg");
      before += originalSize;
      after += output.length;
      converted += 1;

      console.log(
        `  ${kb(originalSize).padStart(6)} KB -> ${kb(output.length).padStart(5)} KB  ${path}`,
      );

      if (dryRun) continue;

      await withRetry(() =>
        supabase.storage
          .from(bucket)
          .upload(jpgPath, output, { contentType: "image/jpeg", upsert: true }),
      );

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(jpgPath);
      const { error: updErr } = await supabase
        .from(owner.table)
        .update({ thumbnail_url: pub.publicUrl })
        .eq("design_id", folder.name)
        .like("thumbnail_url", `%/${file.name}%`);
      if (updErr) {
        // Leave the PNG in place, otherwise the row points at a deleted file.
        console.warn(`    row update failed, keeping PNG: ${updErr.message}`);
        continue;
      }

      if (!keepPng) {
        await withRetry(() => supabase.storage.from(bucket).remove([path]));
      }
      await sleep(150);
    }
  }

  const saved = before - after;
  console.log(
    `${bucket}: ${converted} converted, ${skipped} left alone, ${mb(saved)} MB saved\n`,
  );
  return saved;
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  console.log(
    `dryRun=${dryRun}  minSize=${kb(minBytes)} KB  maxEdge=${MAX_EDGE}px  quality=${JPEG_QUALITY}\n`,
  );

  let saved = 0;
  for (const b of buckets) {
    if (bucketFilter.length && !bucketFilter.includes(b.name)) continue;
    const owner = BUCKET_OWNER[b.name];
    if (!owner) continue;
    try {
      saved += await processBucket(b.name, owner);
    } catch (err) {
      console.log(`${b.name}: FAILED — ${err.message} (re-run to finish)`);
    }
  }

  console.log(`${dryRun ? "Would save" : "Saved"} ${mb(saved)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
