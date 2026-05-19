#!/usr/bin/env node
/**
 * Suggest Shopify product tags for plaque filters from a products export CSV.
 *
 * Usage:
 *   node scripts/suggest-plaque-product-tags.mjs "app/temp/products_export 2.csv" > plaque-tags-suggestions.csv
 *
 * Import the output Tags column into Shopify (merge with existing tags).
 */

import { readFileSync, writeFileSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/suggest-plaque-product-tags.mjs <products-export.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function suggestTags(title, type) {
  const t = (title || "").toLowerCase();
  const tags = new Set();

  if ((type || "").toLowerCase().includes("church")) tags.add("plaque-category:church");
  if (t.includes("decorative wall") || t.includes("wall plaque")) tags.add("plaque-type:decorative");
  else if (t.includes("photo")) tags.add("plaque-type:photo");
  else if (t.includes("attached")) tags.add("plaque-type:attached");
  else tags.add("plaque-type:award");

  if (t.includes("easel")) tags.add("plaque-mount:easel");
  if (t.includes("wall") || t.includes("keyhole")) tags.add("plaque-mount:wall");
  if (t.includes("wooden") || t.includes("wood ")) tags.add("plaque-material:wooden");
  if (t.includes("acrylic")) tags.add("plaque-material:acrylic");

  const sports = [
    "wrestling",
    "volleyball",
    "football",
    "basketball",
    "baseball",
    "soccer",
    "track",
    "triathlon",
    "golf",
    "tennis",
    "hockey",
    "swimming",
    "cheer",
    "softball",
    "lacrosse",
  ];
  if (sports.some((k) => t.includes(k))) tags.add("plaque-category:sports");
  if (
    t.includes("church") ||
    t.includes("religion") ||
    t.includes("prayer") ||
    t.includes("faith") ||
    t.includes("bible")
  )
    tags.add("plaque-category:church");
  if (t.includes("graduation") || t.includes("academic") || t.includes("school"))
    tags.add("plaque-category:academic");
  if (t.includes("employee") || t.includes("retirement") || t.includes("years of service"))
    tags.add("plaque-category:corporate");
  if (t.includes("cook off") || t.includes("chili") || t.includes("competition"))
    tags.add("plaque-category:competitions");
  if (
    ![...tags].some((tag) => tag.startsWith("plaque-category:"))
  ) {
    tags.add("plaque-category:general");
  }

  return [...tags].join(", ");
}

const raw = readFileSync(csvPath, "utf8");
const table = parseCsv(raw);
const header = table[0];
const handleIdx = header.indexOf("Handle");
const titleIdx = header.indexOf("Title");
const typeIdx = header.indexOf("Type");
const tagsIdx = header.indexOf("Tags");

const out = [["Handle", "Title", "Suggested filter tags"]];
for (let i = 1; i < table.length; i++) {
  const row = table[i];
  const handle = row[handleIdx];
  const title = row[titleIdx];
  if (!handle || !title) continue;
  out.push([handle, title, suggestTags(title, row[typeIdx])]);
}

const lines = out.map((r) =>
  r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
);
const outputPath = csvPath.replace(/\.csv$/i, "") + "-suggested-tags.csv";
writeFileSync(outputPath, lines.join("\n") + "\n");
console.error("Wrote", outputPath, `(${out.length - 1} products)`);
