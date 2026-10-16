import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildProposal,
  buildSynonymGapRows,
  chunkJsonlByBytes,
  classifyProduct,
  loadTaxonomy,
  mergeManagedTags,
  normalizeText,
} from "./core.mjs";
import {
  createBulkMutationUpload,
  parseProductJsonl,
  productsBulkQuery,
} from "./shopify.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const taxonomyPath = path.resolve(directory, "../../config/product-taxonomies/signs-bylita.json");
const taxonomy = await loadTaxonomy(taxonomyPath);
const classificationCases = JSON.parse(
  await readFile(path.join(directory, "fixtures/classification-cases.json"), "utf8"),
);

test("normalizes HTML descriptions and entities", () => {
  assert.equal(
    normalizeText("<p>Employees&nbsp;Must <strong>Wash Hands</strong> &amp; Return</p>"),
    "employees must wash hands and return",
  );
});

test("classifies a restroom sign with searchable aliases", () => {
  const result = classifyProduct(
    {
      title: "RESTROOM - Customers Only Sign",
      descriptionHtml: "<p>Bathroom sign for a business.</p>",
      productType: "Signs",
      tags: [],
    },
    taxonomy,
  );
  assert.equal(result.confidence, "high");
  assert(result.managedTags.includes("sbl:category:restroom-hygiene"));
  assert(result.managedTags.includes("sbl:search:bathroom"));
});

test("supports multiple valid classifications", () => {
  const result = classifyProduct(
    {
      title: "Hospital Employees Must Wash Hands",
      descriptionHtml: "Commercial kitchen hygiene sign for clinic staff",
      productType: "Safety Signs",
      tags: [],
    },
    taxonomy,
  );
  assert(result.matchedRules.includes("category:restroom-hygiene"));
  assert(result.matchedRules.includes("industry:healthcare"));
  assert(result.matchedRules.includes("industry:commercial-kitchen"));
});

test("classifies representative catalog fixtures", async (context) => {
  for (const fixture of classificationCases) {
    await context.test(fixture.name, () => {
      const result = classifyProduct(fixture.product, taxonomy);
      for (const expected of fixture.includes) {
        assert(
          result.matchedRules.includes(expected),
          `${fixture.name} should include ${expected}; got ${result.matchedRules.join(", ")}`,
        );
      }
    });
  }
});

test("honors exclusion rules", () => {
  const result = classifyProduct(
    {
      title: "Funny Novelty Desk Nameplate",
      descriptionHtml: "",
      productType: "Desk Signs",
      tags: [],
    },
    taxonomy,
  );
  assert(!result.matchedRules.includes("category:names-titles"));
  assert(result.matchedRules.includes("category:desk-nameplates"));
});

test("leaves ambiguous products unclassified", () => {
  const result = classifyProduct(
    { title: "Blue Rectangle", descriptionHtml: "Durable item", tags: [] },
    taxonomy,
  );
  assert.equal(result.confidence, "unclassified");
  assert.deepEqual(result.managedTags, []);
});

test("ignores style labels, marketing suffixes, and description boilerplate", () => {
  const result = classifyProduct(
    {
      title: "Signs ByLITA Classic Framed Plus Please Deliver Packages Door or Wall Sign | Business & Warehouse Signage",
      descriptionHtml: "<p>Can be attached to the door, wall or window of your home or business. Comes in multiple colors.</p>",
      productType: "Main Office Sign",
      tags: ["Office Signs", "General Business Signs"],
    },
    taxonomy,
  );
  assert.equal(result.confidence, "unclassified");
  assert.deepEqual(result.managedTags, []);
});

test("does not treat novelty caution copy as a safety sign", () => {
  const result = classifyProduct(
    {
      title: "Caution I Haven't Had My Coffee Nameplate Desk Sign",
      descriptionHtml: "Funny novelty desk sign for your home or business.",
      productType: "Novelty Desk Signs",
      tags: [],
    },
    taxonomy,
  );
  assert(result.matchedRules.includes("category:desk-nameplates"));
  assert(!result.matchedRules.includes("category:safety-compliance"));
  assert(!result.matchedRules.includes("industry:cafe-coffee"));
});

test("does not tag explicitly excluded non-sign products", () => {
  const result = classifyProduct(
    {
      handle: "executive-pen-for-office-manager",
      title: "Executive Pen for Office Manager",
      descriptionHtml: "Personalized name gift",
      productType: "Pens",
      tags: [],
    },
    taxonomy,
  );
  assert.equal(result.confidence, "out-of-scope");
  assert.deepEqual(result.managedTags, []);
});

test("replaces managed tags while preserving unrelated tags", () => {
  const merged = mergeManagedTags(
    ["Made in USA", "sbl:category:old", "Material: Acrylic"],
    ["sbl:category:restroom-hygiene"],
    "sbl:",
  );
  assert.deepEqual(merged, [
    "Made in USA",
    "Material: Acrylic",
    "sbl:category:restroom-hygiene",
  ]);
});

test("proposal generation is idempotent", () => {
  const product = {
    id: "gid://shopify/Product/1",
    title: "Security Camera Video Recording Sign",
    descriptionHtml: "",
    productType: "Signs",
    tags: ["Made in USA"],
  };
  const first = buildProposal(product, taxonomy);
  const second = buildProposal({ ...product, tags: first.finalTags }, taxonomy);
  assert.deepEqual(second.finalTags, first.finalTags);
  assert.deepEqual(second.removedManagedTags, []);
});

test("reports missing search synonyms", () => {
  const rows = buildSynonymGapRows(
    [{ title: "Bathroom Sign", descriptionHtml: "" }],
    { synonymGroups: [["restroom", "bathroom", "washroom"]] },
  );
  assert.match(rows[0].populatedTerms, /bathroom \(1\)/);
  assert.match(rows[0].missingTerms, /restroom/);
});

test("builds an incremental product bulk query", () => {
  const query = productsBulkQuery({
    since: "2026-10-01T00:00:00.000Z",
    query: "status:active",
  });
  assert.match(query, /status:active/);
  assert.match(query, /updated_at:>'2026-10-01T00:00:00.000Z'/);
  assert.match(query, /sortKey: UPDATED_AT/);
  assert.match(query, /descriptionHtml/);
});

test("parses product JSONL and ignores child records", () => {
  const products = parseProductJsonl(
    '{"id":"gid://shopify/Product/1","title":"One"}\n' +
      '{"id":"gid://shopify/ProductVariant/2","__parentId":"gid://shopify/Product/1"}\n',
  );
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "One");
});

test("uses the staged upload key as the bulk mutation path", async () => {
  let uploadedEntries;
  const client = {
    async graphql() {
      return {
        stagedUploadsCreate: {
          stagedTargets: [
            {
              url: "https://uploads.example.test",
              resourceUrl: null,
              parameters: [
                { name: "key", value: "tmp/shop/bulk/bulk_op_vars" },
                { name: "Content-Type", value: "text/jsonl" },
              ],
            },
          ],
          userErrors: [],
        },
      };
    },
    async fetchImpl(_url, options) {
      uploadedEntries = [...options.body.entries()];
      return new Response("", { status: 201 });
    },
  };
  const stagedPath = await createBulkMutationUpload(
    client,
    path.join(directory, "fixtures/classification-cases.json"),
  );
  assert.equal(stagedPath, "tmp/shop/bulk/bulk_op_vars");
  assert.equal(uploadedEntries.at(-1)[0], "file");
});

test("splits bulk mutation JSONL below the byte limit without losing records", () => {
  const records = [
    { product: { id: "1", tags: ["one"] } },
    { product: { id: "2", tags: ["two"] } },
    { product: { id: "3", tags: ["three"] } },
  ];
  const oneLineLimit = Math.max(
    ...records.map((record) => Buffer.byteLength(`${JSON.stringify(record)}\n`)),
  );
  const chunks = chunkJsonlByBytes(records, oneLineLimit);
  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.flatMap((chunk) => chunk.trim().split("\n").map(JSON.parse)),
    records,
  );
});
