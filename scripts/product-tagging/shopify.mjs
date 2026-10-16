import { readFile } from "node:fs/promises";
import process from "node:process";

const MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShop(raw) {
  let value = String(raw ?? "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").split("/")[0];
  if (/^[a-z0-9][a-z0-9-]*$/.test(value)) value = `${value}.myshopify.com`;
  if (!MYSHOPIFY.test(value)) throw new Error(`Invalid Shopify shop: ${raw || "(empty)"}`);
  return value;
}

export function createAdminClient({
  shop = process.env.SHOPIFY_ADMIN_SHOP ?? process.env.SHOPIFY_STORE_URL,
  token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? process.env.SHOPIFY_ACCESS_TOKEN,
  apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-07",
  fetchImpl = fetch,
} = {}) {
  const normalizedShop = normalizeShop(shop);
  if (!token?.trim()) {
    throw new Error("Set SHOPIFY_ADMIN_ACCESS_TOKEN (or SHOPIFY_ACCESS_TOKEN).");
  }
  const endpoint = `https://${normalizedShop}/admin/api/${encodeURIComponent(apiVersion)}/graphql.json`;

  async function graphql(query, variables = {}) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token.trim(),
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Shopify returned non-JSON (${response.status}): ${text.slice(0, 300)}`);
    }
    if (!response.ok || body.errors?.length) {
      throw new Error(
        `Shopify GraphQL failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`,
      );
    }
    return body.data;
  }

  return { apiVersion, endpoint, graphql, shop: normalizedShop, fetchImpl };
}

function userErrorMessage(errors = []) {
  return errors.map((error) => `${error.field?.join(".") ?? "input"}: ${error.message}`).join("; ");
}

function searchQuery({ since, query }) {
  const parts = [];
  if (query) parts.push(`(${query})`);
  if (since) {
    const iso = new Date(since);
    if (Number.isNaN(iso.valueOf())) throw new Error(`Invalid --since date: ${since}`);
    parts.push(`updated_at:>'${iso.toISOString()}'`);
  }
  return parts.join(" AND ");
}

export function productsBulkQuery(options = {}) {
  const productQuery = searchQuery(options).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const argumentsList = [];
  if (productQuery) argumentsList.push(`query: "${productQuery}"`);
  if (options.since) argumentsList.push("sortKey: UPDATED_AT");
  const queryArgument = argumentsList.length > 0 ? `(${argumentsList.join(", ")})` : "";
  return `{
    products${queryArgument} {
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          productType
          vendor
          tags
          status
          updatedAt
        }
      }
    }
  }`;
}

export async function startProductExport(client, options = {}) {
  const data = await client.graphql(
    `mutation StartProductTaggingExport($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }`,
    { query: productsBulkQuery(options) },
  );
  const result = data.bulkOperationRunQuery;
  if (result.userErrors?.length) throw new Error(userErrorMessage(result.userErrors));
  if (!result.bulkOperation?.id) throw new Error("Shopify did not return a bulk operation ID.");
  return result.bulkOperation;
}

export async function getBulkOperation(client, id) {
  const data = await client.graphql(
    `query ProductTaggingBulkStatus($id: ID!) {
      bulkOperation(id: $id) {
        id
        status
        errorCode
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }`,
    { id },
  );
  if (!data.bulkOperation) throw new Error(`Bulk operation not found: ${id}`);
  return data.bulkOperation;
}

export async function waitForBulkOperation(
  client,
  id,
  { intervalMs = 5000, timeoutMs = 24 * 60 * 60 * 1000, onProgress } = {},
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const operation = await getBulkOperation(client, id);
    onProgress?.(operation);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(
        `Bulk operation ${operation.status}: ${operation.errorCode ?? "unknown error"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for bulk operation ${id}.`);
}

export async function downloadJsonl(client, url) {
  if (!url) throw new Error("Bulk operation completed without a download URL.");
  const response = await client.fetchImpl(url, { headers: { Accept: "application/jsonl" } });
  if (!response.ok) throw new Error(`Bulk result download failed (${response.status}).`);
  return response.text();
}

export function parseProductJsonl(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid product JSONL at line ${index + 1}: ${error.message}`);
      }
    })
    .filter((row) => row.id && !row.__parentId);
}

export async function exportProducts(client, options = {}) {
  const started = await startProductExport(client, options);
  const completed = await waitForBulkOperation(client, started.id, options);
  if (!completed.url && Number(completed.objectCount ?? 0) === 0) return [];
  return parseProductJsonl(await downloadJsonl(client, completed.url));
}

export async function fetchCurrentProductTags(client, ids, batchSize = 100) {
  const result = new Map();
  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const data = await client.graphql(
      `query CurrentProductTags($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id handle title tags updatedAt }
        }
      }`,
      { ids: batch },
    );
    for (const product of data.nodes ?? []) {
      if (product?.id) result.set(product.id, product);
    }
  }
  return result;
}

export async function createBulkMutationUpload(client, jsonlPath) {
  const file = await readFile(jsonlPath);
  const filename = jsonlPath.split("/").pop() ?? "product-tags.jsonl";
  const data = await client.graphql(
    `mutation ProductTaggingUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: "BULK_MUTATION_VARIABLES",
          filename,
          mimeType: "text/jsonl",
          httpMethod: "POST",
        },
      ],
    },
  );
  const result = data.stagedUploadsCreate;
  if (result.userErrors?.length) throw new Error(userErrorMessage(result.userErrors));
  const target = result.stagedTargets?.[0];
  const stagedUploadPath = target?.parameters?.find(
    (parameter) => parameter.name === "key",
  )?.value;
  if (!target?.url || !stagedUploadPath) {
    throw new Error("No staged upload URL or key returned.");
  }

  const form = new FormData();
  for (const parameter of target.parameters ?? []) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([file], { type: "text/jsonl" }), filename);
  const upload = await client.fetchImpl(target.url, { method: "POST", body: form });
  if (!upload.ok) {
    throw new Error(`Staged JSONL upload failed (${upload.status}): ${(await upload.text()).slice(0, 500)}`);
  }
  return stagedUploadPath;
}

export async function startProductTagMutation(client, stagedUploadPath) {
  const mutation = `mutation ProductTaggingUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }`;
  const data = await client.graphql(
    `mutation StartProductTaggingMutation(
      $mutation: String!
      $stagedUploadPath: String!
      $clientIdentifier: String
    ) {
      bulkOperationRunMutation(
        mutation: $mutation
        stagedUploadPath: $stagedUploadPath
        clientIdentifier: $clientIdentifier
      ) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }`,
    {
      mutation,
      stagedUploadPath,
      clientIdentifier: `product-tagging-${Date.now()}`,
    },
  );
  const result = data.bulkOperationRunMutation;
  if (result.userErrors?.length) throw new Error(userErrorMessage(result.userErrors));
  if (!result.bulkOperation?.id) throw new Error("Shopify did not return a mutation operation ID.");
  return result.bulkOperation;
}

export function parseMutationResults(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const row = JSON.parse(line);
      const payload = row.data?.productUpdate;
      return {
        line: index + 1,
        productId: payload?.product?.id ?? null,
        errors: payload?.userErrors ?? row.errors ?? [],
      };
    });
}
