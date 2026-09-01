#!/usr/bin/env node
/**
 * Export Gadget model records to backups/gadget/data/.
 *
 * Usage:
 *   node scripts/backup-gadget-data.mjs
 *
 * Reads GADGET_*_API_URL / GADGET_*_API_KEY from the environment or a local .env
 * (never writes keys into the backup files).
 *
 * Skips session records. Strips keys that look like tokens/secrets from Shopify shop dumps.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "backups", "gadget", "data");
const PAGE_SIZE = 100;

const SKIP_INTERNAL_LISTS = new Set([
  "listSession",
  "gellyView",
  "currentTransactionDetails",
]);

const SENSITIVE_KEY = /(?:access[_-]?token|api[_-]?key|secret|password|private[_-]?key|refresh[_-]?token)$/i;

const TARGETS = [
  { name: "badge", urlEnv: "GADGET_API_URL", keyEnv: "GADGET_API_KEY" },
  { name: "sign", urlEnv: "GADGET_SIGN_API_URL", keyEnv: "GADGET_SIGN_API_KEY" },
  { name: "plaque", urlEnv: "GADGET_PLAQUE_API_URL", keyEnv: "GADGET_PLAQUE_API_KEY" },
  { name: "stamp", urlEnv: "GADGET_STAMP_API_URL", keyEnv: "GADGET_STAMP_API_KEY" },
  { name: "nameplate", urlEnv: "GADGET_NAMEPLATE_API_URL", keyEnv: "GADGET_NAMEPLATE_API_KEY" },
  { name: "desk-sign", urlEnv: "GADGET_DESK_SIGN_API_URL", keyEnv: "GADGET_DESK_SIGN_API_KEY" },
  { name: "gavel", urlEnv: "GADGET_GAVEL_API_URL", keyEnv: "GADGET_GAVEL_API_KEY" },
  { name: "pen", urlEnv: "GADGET_PEN_API_URL", keyEnv: "GADGET_PEN_API_KEY" },
];

function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadDotEnv() {
  try {
    const text = await readFile(join(ROOT, ".env"), "utf8");
    return parseEnvFile(text);
  } catch {
    return {};
  }
}

function env(fileEnv, key) {
  return (process.env[key] || fileEnv[key] || "").trim();
}

function graphqlUrl(apiBase) {
  return `${apiBase.replace(/\/$/, "")}/api/graphql`;
}

async function gadgetGraphql(apiBase, apiKey, query, variables) {
  const res = await fetch(graphqlUrl(apiBase), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

function unwrapType(t) {
  while (t && (t.kind === "NON_NULL" || t.kind === "LIST")) t = t.ofType;
  return t;
}

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = v ? "[redacted]" : v;
      } else {
        out[k] = stripSensitive(v);
      }
    }
    return out;
  }
  return value;
}

async function listInternalFields(apiBase, apiKey) {
  const data = await gadgetGraphql(
    apiBase,
    apiKey,
    `query BackupIntrospect {
      __type(name: "InternalQueries") {
        fields {
          name
          type {
            kind
            name
            ofType { kind name ofType { kind name } }
          }
        }
      }
    }`,
  );
  const fields = data?.__type?.fields || [];
  return fields
    .filter((f) => f.name.startsWith("list") && !SKIP_INTERNAL_LISTS.has(f.name))
    .map((f) => ({
      field: f.name,
      typeName: unwrapType(f.type)?.name || "",
    }));
}

async function paginateInternalList(apiBase, apiKey, fieldName) {
  const records = [];
  let after = null;
  for (;;) {
    const data = await gadgetGraphql(
      apiBase,
      apiKey,
      `query BackupList($first: Int, $after: String) {
        internal {
          ${fieldName}(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node }
          }
        }
      }`,
      { first: PAGE_SIZE, after },
    );
    const conn = data?.internal?.[fieldName];
    if (!conn) break;
    for (const edge of conn.edges || []) {
      if (edge?.node != null) records.push(stripSensitive(edge.node));
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (!after) break;
  }
  return records;
}

function slugFromListField(field) {
  return field.replace(/^list/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

async function dumpTarget(fileEnv, target, seenEndpoints) {
  const url = env(fileEnv, target.urlEnv);
  const key = env(fileEnv, target.keyEnv);
  if (!url || !key) {
    return {
      name: target.name,
      skipped: true,
      reason: !url ? `missing ${target.urlEnv}` : `missing ${target.keyEnv}`,
    };
  }
  const endpointKey = `${url}::${key.slice(0, 8)}`;
  if (seenEndpoints.has(endpointKey)) {
    return {
      name: target.name,
      skipped: true,
      reason: `same Gadget app as a previous target (${url})`,
    };
  }
  seenEndpoints.add(endpointKey);

  const lists = await listInternalFields(url, key);
  const models = {};
  for (const { field } of lists) {
    const records = await paginateInternalList(url, key, field);
    models[slugFromListField(field)] = {
      internalListField: field,
      count: records.length,
      records,
    };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const appSlug = new URL(url).hostname.replace(/\.gadget\.app$/, "");
  const fileName = `${appSlug}--${target.name}--${stamp}.json`;
  const payload = {
    exportedAt: new Date().toISOString(),
    source: { name: target.name, apiUrl: url },
    modelCounts: Object.fromEntries(
      Object.entries(models).map(([k, v]) => [k, v.count]),
    ),
    models,
  };
  await writeFile(join(OUT_DIR, fileName), JSON.stringify(payload, null, 2));
  return {
    name: target.name,
    skipped: false,
    apiUrl: url,
    file: `backups/gadget/data/${fileName}`,
    modelCounts: payload.modelCounts,
  };
}

async function main() {
  const fileEnv = await loadDotEnv();
  await mkdir(OUT_DIR, { recursive: true });
  const seen = new Set();
  const results = [];
  for (const target of TARGETS) {
    try {
      results.push(await dumpTarget(fileEnv, target, seen));
    } catch (err) {
      results.push({
        name: target.name,
        skipped: true,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const manifest = {
    exportedAt: new Date().toISOString(),
    results,
  };
  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
