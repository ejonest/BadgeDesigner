#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildProposal,
  buildSynonymGapRows,
  chunkJsonlByBytes,
  loadTaxonomy,
  mergeManagedTags,
  parseTags,
  uniqueTags,
} from "./core.mjs";
import { csvToRecords, recordsToCsv } from "./csv.mjs";
import {
  createAdminClient,
  createBulkMutationUpload,
  downloadJsonl,
  exportProducts,
  fetchCurrentProductTags,
  parseMutationResults,
  startProductTagMutation,
  waitForBulkOperation,
} from "./shopify.mjs";

const DEFAULT_TAXONOMY = "config/product-taxonomies/signs-bylita.json";
const DEFAULT_OUTPUT = "product-tagging-output";
const MAX_BULK_JSONL_BYTES = 95 * 1024 * 1024;
const REVIEW_COLUMNS = [
  { key: "productId", header: "Product ID" },
  { key: "handle", header: "Handle" },
  { key: "title", header: "Title" },
  { key: "status", header: "Status" },
  { key: "updatedAt", header: "Updated At" },
  { key: "taxonomyVersion", header: "Taxonomy Version" },
  { key: "currentTags", header: "Current Tags JSON" },
  { key: "proposedManagedTags", header: "Proposed Managed Tags JSON" },
  { key: "removedManagedTags", header: "Removed Managed Tags JSON" },
  { key: "finalTags", header: "Preview Final Tags JSON" },
  { key: "confidence", header: "Confidence" },
  { key: "score", header: "Score" },
  { key: "matchedRules", header: "Matched Rules" },
  { key: "conflicts", header: "Conflicts" },
  { key: "reasons", header: "Reasons" },
  { key: "approved", header: "Approved" },
];

function usage() {
  console.log(`Reusable Shopify product tagging

Usage:
  node scripts/product-tagging/cli.mjs propose [options]
  node scripts/product-tagging/cli.mjs apply --review <review.csv> [options]

Options:
  --taxonomy <path>       Taxonomy JSON (${DEFAULT_TAXONOMY})
  --output <directory>    Run artifacts (${DEFAULT_OUTPUT})
  --shop <domain>         Overrides SHOPIFY_ADMIN_SHOP
  --api-version <version> Overrides SHOPIFY_ADMIN_API_VERSION
  --query <search>        Additional Shopify product search query
  --since <ISO date>      Only products updated after this time
  --incremental           Read the saved checkpoint when --since is omitted
  --include-status <list> Comma-separated statuses, for example ACTIVE,DRAFT
  --review <path>         Reviewed proposal CSV (apply only)
  --confirm <phrase>      Must equal APPLY_APPROVED_TAGS to write to Shopify
  --help                  Show this help
`);
}

function parseArgs(argv) {
  if (argv[0] === "--help") return { help: true };
  const args = { command: argv[0] };
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (["help", "incremental"].includes(key)) {
      args[key] = true;
      continue;
    }
    if (index + 1 >= argv.length) throw new Error(`Missing value for ${value}`);
    args[key] = argv[++index];
  }
  return args;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeShopName(shop) {
  return shop.replace(/\.myshopify\.com$/i, "").replace(/[^a-z0-9-]/gi, "-");
}

function parseJsonArray(value, label) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("expected a string array");
    }
    return parsed;
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function isApproved(value) {
  return ["yes", "y", "true", "1", "approved"].includes(String(value).trim().toLowerCase());
}

function validateTags(tags, productId) {
  if (tags.length > 250) throw new Error(`${productId} would have ${tags.length} tags; Shopify allows 250.`);
  const oversized = tags.find((tag) => tag.length > 255);
  if (oversized) throw new Error(`${productId} has a tag longer than 255 characters: ${oversized}`);
}

async function readCheckpoint(checkpointPath, taxonomy) {
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (checkpoint.taxonomyVersion !== taxonomy.taxonomyVersion) {
      throw new Error(
        `Checkpoint taxonomy ${checkpoint.taxonomyVersion} does not match ${taxonomy.taxonomyVersion}. Run a full proposal.`,
      );
    }
    return checkpoint;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function propose(args) {
  const taxonomyPath = path.resolve(args.taxonomy ?? DEFAULT_TAXONOMY);
  const outputRoot = path.resolve(args.output ?? DEFAULT_OUTPUT);
  const taxonomy = await loadTaxonomy(taxonomyPath);
  const client = createAdminClient({
    shop: args.shop,
    apiVersion: args.apiVersion,
  });
  const storeRoot = path.join(outputRoot, safeShopName(client.shop));
  const checkpointPath = path.join(storeRoot, "checkpoint.json");
  await mkdir(storeRoot, { recursive: true });

  let since = args.since;
  if (!since && args.incremental) {
    const checkpoint = await readCheckpoint(checkpointPath, taxonomy);
    since = checkpoint?.lastSuccessfulUpdatedAt;
    if (!since) console.error("No checkpoint found; running a full proposal.");
  }
  console.error(`Starting read-only product export for ${client.shop}${since ? ` since ${since}` : ""}...`);
  let products = await exportProducts(client, {
    since,
    query: args.query,
    onProgress(operation) {
      console.error(`Export ${operation.status}: ${operation.objectCount ?? 0} objects`);
    },
  });
  if (args.includeStatus) {
    const statuses = new Set(args.includeStatus.toUpperCase().split(",").map((item) => item.trim()));
    products = products.filter((product) => statuses.has(String(product.status).toUpperCase()));
  }

  const proposals = products.map((product) => {
    const proposal = buildProposal(product, taxonomy);
    validateTags(proposal.finalTags, proposal.productId);
    return {
      ...proposal,
      taxonomyVersion: taxonomy.taxonomyVersion,
      currentTags: JSON.stringify(proposal.currentTags),
      proposedManagedTags: JSON.stringify(proposal.proposedManagedTags),
      removedManagedTags: JSON.stringify(proposal.removedManagedTags),
      finalTags: JSON.stringify(proposal.finalTags),
      matchedRules: proposal.matchedRules.join(" | "),
      conflicts: proposal.conflicts.join(" | "),
      reasons: proposal.reasons.join(" || "),
      approved: "",
    };
  });

  const runId = stamp();
  const runDirectory = path.join(storeRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  const reviewPath = path.join(runDirectory, "review.csv");
  const unresolvedPath = path.join(runDirectory, "unresolved.csv");
  const synonymPath = path.join(runDirectory, "search-synonym-gaps.csv");
  const manifestPath = path.join(runDirectory, "manifest.json");
  await writeFile(reviewPath, recordsToCsv(proposals, REVIEW_COLUMNS));
  await writeFile(
    unresolvedPath,
    recordsToCsv(
      proposals.filter((proposal) =>
        ["unclassified", "conflict"].includes(proposal.confidence),
      ),
      REVIEW_COLUMNS,
    ),
  );
  await writeFile(
    synonymPath,
    recordsToCsv(buildSynonymGapRows(products, taxonomy), [
      { key: "group", header: "Synonym Group" },
      { key: "populatedTerms", header: "Terms Found In Catalog" },
      { key: "missingTerms", header: "Terms Missing From Catalog" },
      { key: "recommendation", header: "Recommendation" },
    ]),
  );

  const updatedTimes = products
    .map((product) => Date.parse(product.updatedAt))
    .filter(Number.isFinite);
  const lastSuccessfulUpdatedAt =
    updatedTimes.length > 0 ? new Date(Math.max(...updatedTimes)).toISOString() : since ?? null;
  const manifest = {
    mode: "propose",
    readOnly: true,
    shop: client.shop,
    apiVersion: client.apiVersion,
    taxonomyPath,
    taxonomyVersion: taxonomy.taxonomyVersion,
    managedPrefix: taxonomy.managedPrefix,
    since: since ?? null,
    query: args.query ?? null,
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    confidenceCounts: proposals.reduce((counts, proposal) => {
      counts[proposal.confidence] = (counts[proposal.confidence] ?? 0) + 1;
      return counts;
    }, {}),
    lastSuccessfulUpdatedAt,
    reviewPath,
    unresolvedPath,
    synonymPath,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    checkpointPath,
    `${JSON.stringify(
      {
        shop: client.shop,
        taxonomyVersion: taxonomy.taxonomyVersion,
        lastSuccessfulUpdatedAt,
        lastRunManifest: manifestPath,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(manifest, null, 2));
}

async function apply(args) {
  if (!args.review) throw new Error("apply requires --review <review.csv>.");
  const taxonomy = await loadTaxonomy(path.resolve(args.taxonomy ?? DEFAULT_TAXONOMY));
  const rows = csvToRecords(await readFile(path.resolve(args.review), "utf8"));
  const approved = rows.filter((row) => isApproved(row.Approved));
  if (approved.length === 0) throw new Error("The review CSV contains no approved rows.");
  const approvedIds = approved.map((row) => row["Product ID"]);
  if (new Set(approvedIds).size !== approvedIds.length) {
    throw new Error("The review CSV contains duplicate approved Product IDs.");
  }
  for (const row of approved) {
    if (!row["Product ID"]?.startsWith("gid://shopify/Product/")) {
      throw new Error(`Invalid Product ID in review CSV: ${row["Product ID"]}`);
    }
    if (row["Taxonomy Version"] !== taxonomy.taxonomyVersion) {
      throw new Error(
        `Taxonomy version mismatch for ${row.Handle}: review=${row["Taxonomy Version"]}, current=${taxonomy.taxonomyVersion}`,
      );
    }
    const proposed = parseJsonArray(row["Proposed Managed Tags JSON"], `${row.Handle} proposed tags`);
    if (proposed.some((tag) => !tag.toLowerCase().startsWith(taxonomy.managedPrefix.toLowerCase()))) {
      throw new Error(`${row.Handle} contains a proposed tag outside ${taxonomy.managedPrefix}.`);
    }
  }

  const client = createAdminClient({ shop: args.shop, apiVersion: args.apiVersion });
  const current = await fetchCurrentProductTags(
    client,
    approved.map((row) => row["Product ID"]),
  );
  const updates = approved.map((row) => {
    const product = current.get(row["Product ID"]);
    if (!product) throw new Error(`Product no longer exists: ${row["Product ID"]}`);
    const proposed = parseJsonArray(row["Proposed Managed Tags JSON"], `${row.Handle} proposed tags`);
    const tags = mergeManagedTags(product.tags, proposed, taxonomy.managedPrefix);
    validateTags(tags, product.id);
    return { row, product, tags };
  });

  const outputRoot = path.resolve(args.output ?? DEFAULT_OUTPUT);
  const runDirectory = path.join(outputRoot, safeShopName(client.shop), `apply-${stamp()}`);
  await mkdir(runDirectory, { recursive: true });
  const rollbackPath = path.join(runDirectory, "rollback.csv");
  await writeFile(
    rollbackPath,
    recordsToCsv(
      updates.map(({ product }) => ({
        productId: product.id,
        handle: product.handle,
        title: product.title,
        tags: JSON.stringify(parseTags(product.tags)),
        capturedAt: new Date().toISOString(),
      })),
      [
        { key: "productId", header: "Product ID" },
        { key: "handle", header: "Handle" },
        { key: "title", header: "Title" },
        { key: "tags", header: "Rollback Tags JSON" },
        { key: "capturedAt", header: "Captured At" },
      ],
    ),
  );

  if (args.confirm !== "APPLY_APPROVED_TAGS") {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          message: "No changes made. Re-run with --confirm APPLY_APPROVED_TAGS after reviewing this summary.",
          shop: client.shop,
          approvedProducts: updates.length,
          rollbackPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  const mutationInputs = updates.map(({ product, tags }) => ({
    product: { id: product.id, tags: uniqueTags(tags) },
  }));
  const chunks = chunkJsonlByBytes(mutationInputs, MAX_BULK_JSONL_BYTES);
  const operations = [];
  const results = [];
  for (let index = 0; index < chunks.length; index++) {
    const batchNumber = index + 1;
    const jsonlPath = path.join(
      runDirectory,
      `mutation-input-${String(batchNumber).padStart(3, "0")}.jsonl`,
    );
    await writeFile(jsonlPath, chunks[index]);
    const stagedUploadPath = await createBulkMutationUpload(client, jsonlPath);
    const operation = await startProductTagMutation(client, stagedUploadPath);
    const completed = await waitForBulkOperation(client, operation.id, {
      onProgress(status) {
        console.error(
          `Apply batch ${batchNumber}/${chunks.length} ${status.status}: ${status.objectCount ?? 0} objects`,
        );
      },
    });
    operations.push({
      batch: batchNumber,
      id: completed.id,
      status: completed.status,
      objectCount: completed.objectCount,
    });
    if (completed.url) {
      results.push(
        ...parseMutationResults(await downloadJsonl(client, completed.url)).map((result) => ({
          batch: batchNumber,
          ...result,
        })),
      );
    }
  }
  const resultPath = path.join(runDirectory, "results.json");
  const audit = {
    mode: "apply",
    shop: client.shop,
    taxonomyVersion: taxonomy.taxonomyVersion,
    appliedAt: new Date().toISOString(),
    requestedCount: updates.length,
    operations,
    objectCount: operations.reduce(
      (total, operation) => total + Number(operation.objectCount ?? 0),
      0,
    ),
    errorCount: results.filter((result) => result.errors.length > 0).length,
    rollbackPath,
    results,
  };
  await writeFile(resultPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({ ...audit, resultPath }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    usage();
    return;
  }
  if (args.command === "propose") return propose(args);
  if (args.command === "apply") return apply(args);
  throw new Error(`Unknown command: ${args.command}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
