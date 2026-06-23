#!/usr/bin/env node
/**
 * Suggest Shopify product tags for AQB catalog filters from a products export CSV.
 *
 * Usage:
 *   node scripts/suggest-aqb-product-tags.mjs "app/temp/products_export_1 2.csv"
 *
 * Outputs (next to input file):
 *   *-suggested-tags.csv   — review: Handle, Title, Type, Current Tags, Suggested Tags, Merged Tags
 *   *-tagged-export.csv    — full Shopify export with merged Tags on first row per product
 */

import { readFileSync, writeFileSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/suggest-aqb-product-tags.mjs <products-export.csv>");
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

function escapeCsv(cell) {
  return `"${String(cell ?? "").replace(/"/g, '""')}"`;
}

function writeCsv(rows) {
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n") + "\n";
}

function parseTags(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function mergeTags(existing, suggested) {
  const seen = new Set();
  const out = [];
  for (const tag of [...existing, ...suggested]) {
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function containsAny(text, keywords) {
  return keywords.some((k) => {
    if (k.length <= 4) {
      const re = new RegExp(`(?:^|[\\s,/\\-–—(|"'])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s,/\\-–—)|"'])`);
      return re.test(` ${text} `);
    }
    return text.includes(k);
  });
}

function isDeskNovelty(title) {
  const t = title.toLowerCase();
  if (t.includes("novelty")) return true;
  if (
    containsAny(t, [
      "can't even",
      "cant even",
      "boss lady",
      "please say no",
      "do not disturb",
      "head honcho",
      "hot mess",
      "zero fucks",
      "not your therapist",
      "not today",
      "middle finger",
      "apocalypse",
      "fuck",
      "shit",
      "damn",
      "bitch",
      "ass hole",
      "asshole",
      "constant delight",
      "sarcastic",
      "funny ",
      "humor",
      "humour",
    ])
  ) {
    return true;
  }
  if (t.includes("nameplate") && containsAny(t, ["best work", "colleague", "coworker", "husband", "wife"])) {
    return true;
  }
  return false;
}

function isDeskBusinessSign(title) {
  const t = title.toLowerCase();
  if (isDeskNovelty(title)) return false;
  if (t.includes("personalized")) return false;
  return containsAny(t, [
    "our staff will be",
    "please wait",
    "will be with you",
    "checkout",
    "check out",
    "restroom",
    "bathroom",
    "employees only",
    "authorized personnel",
    "no entry",
    "closed",
    "open ",
    "welcome to",
    "reception",
    "information",
    "in session",
    "meeting in progress",
  ]);
}

function deskMaterialTags(title) {
  const t = title.toLowerCase();
  if (t.includes("rosewood")) return ["rosewood"];
  if (
    containsAny(t, [
      "plastic",
      "black frame",
      "silver frame",
      "gold frame",
      "insert",
      "nameplate desk sign (2x8",
      "frame, desk sign",
    ])
  ) {
    return ["insert", "plastic"];
  }
  // Default material for desk name plates is acrylic (matches catalog filter default).
  return ["acrylic"];
}

function deskProfessionIndustry(title) {
  const t = title.toLowerCase();
  if (
    containsAny(t, [
      "doctor",
      "medical",
      "nurse",
      "physician",
      "dental",
      "pharmacy",
      "therapist",
      "clinic",
      "hospital",
      "surgeon",
      "paramedic",
      "radiolog",
      "patholog",
      "health",
    ])
  ) {
    return "healthcare";
  }
  if (
    containsAny(t, [
      "retail",
      "cashier",
      "checkout",
      "store manager",
      "sales associate",
      "merchandis",
      "shop ",
    ])
  ) {
    return "retail";
  }
  if (
    containsAny(t, [
      "hotel",
      "concierge",
      "front desk",
      "restaurant",
      "guest service",
      "housekeep",
      "valet",
      "bellhop",
      "barista",
      "hostess",
      "server ",
      "bartender",
      "hospitality",
    ])
  ) {
    return "hospitality";
  }
  return "office";
}

function deskNoveltySubtags(title) {
  const t = title.toLowerCase();
  const tags = ["novelty"];
  if (
    containsAny(t, [
      "funny",
      "humor",
      "humour",
      "fuck",
      "shit",
      "damn",
      "bitch",
      "sarcastic",
      "delight",
      "please say no",
      "can't even",
      "hot mess",
      "therapist",
    ])
  ) {
    tags.push("funny");
  }
  if (containsAny(t, ["boss", "head honcho", "in charge", "manager", "ceo", "leader", "honcho"])) {
    tags.push("boss");
  }
  if (
    containsAny(t, [
      "colleague",
      "coworker",
      "work husband",
      "work wife",
      "office",
      "busy",
      "do not disturb",
    ])
  ) {
    tags.push("office");
  }
  if (t.includes("gift")) tags.push("gift");
  return [...new Set(tags)];
}

function suggestDeskSignTags(title) {
  const tags = ["desk-sign"];
  tags.push(...deskMaterialTags(title));

  if (isDeskNovelty(title)) {
    tags.push(...deskNoveltySubtags(title));
    return [...new Set(tags)];
  }

  if (isDeskBusinessSign(title)) {
    tags.push("business");
  }

  tags.push(deskProfessionIndustry(title));
  return [...new Set(tags)];
}

function suggestRoleBadgeTags(title, productType) {
  const t = title.toLowerCase();
  const tags = ["role-badge"];

  const rules = [
    {
      tag: "church",
      keywords: [
        "church",
        "pastor",
        "deacon",
        "minister",
        "worship",
        "congregation",
        "ujier",
        "usher",
        "greeter welcome",
        "chaplain",
        "ministry",
        "senior pastor",
      ],
    },
    {
      tag: "healthcare",
      keywords: [
        "nurse",
        "doctor",
        "medical",
        "phlebotom",
        "dental",
        "physician",
        "therapist",
        "health",
        "cna",
        "lpn",
        "radiograph",
        "patholog",
        "caregiver",
        "social worker",
        "pharmac",
        "surgeon",
        "clinic",
        "hospital",
        "first aid",
      ],
    },
    {
      tag: "fitness",
      keywords: [
        "trainer",
        "fitness",
        "gym",
        "coach",
        "nutrition",
        "massage",
        "yoga",
        "pilates",
        "instructor",
        "conditioning",
      ],
    },
    {
      tag: "hospitality",
      keywords: [
        "hotel",
        "concierge",
        "server",
        "bartender",
        "hostess",
        "housekeep",
        "front desk",
        "valet",
        "bellhop",
        "barista",
        "cruise",
        "tour guide",
        "ride attendant",
        "parking attendant",
        "wedding planner",
        "hair stylist",
        "salon",
      ],
    },
    {
      tag: "security",
      keywords: ["security", "guard", "officer", "sheriff", "police", "deputy", "fire warden"],
    },
    {
      tag: "retail",
      keywords: [
        "cashier",
        "retail",
        "sales associate",
        "store manager",
        "bank teller",
        "customer care",
        "customer support",
      ],
    },
    {
      tag: "education",
      keywords: [
        "teacher",
        "school",
        "principal",
        "professor",
        "education",
        "librarian",
        "counselor",
        "mentor",
        "docent",
        "museum",
      ],
    },
    {
      tag: "trades",
      keywords: [
        "maintenance",
        "technician",
        "facility",
        "janitor",
        "custodian",
        "plumber",
        "electrician",
        "hvac",
        "mechanic",
        "driver",
        "warehouse",
        "forklift",
        "landscap",
        "crane operator",
        "heavy equipment",
        "engineer",
        "operator",
        "quality control",
        "safety steward",
      ],
    },
    {
      tag: "events",
      keywords: [
        "volunteer",
        "event",
        "civic",
        "mayor",
        "election",
        "poll worker",
        "town hall",
        "city council",
        "candidate",
        "attendee",
        "alumni",
        "sponsor",
        "facilitator",
        "translator",
        "photographer",
      ],
    },
    {
      tag: "corporate",
      keywords: [
        "manager",
        "director",
        "coordinator",
        "analyst",
        "marketing",
        "human resources",
        "operations",
        "administrator",
        "executive",
        "supervisor",
        "consultant",
        "receptionist",
        "assistant",
        "clerk",
        "accountant",
        "finance",
        "ceo",
        "cfo",
        "cto",
        " hr ",
        "secretary",
        "specialist",
        "agent",
        "representative",
        "lead",
        "chief",
        "president",
        "vice president",
        "recruiter",
        "employee",
        "digital overlord",
        "artist",
        "apocalypse survivor",
      ],
    },
  ];

  if (productType === "Church & Congregation") {
    tags.push("church");
  }

  for (const rule of rules) {
    if (containsAny(t, rule.keywords)) {
      tags.push(rule.tag);
    }
  }

  const categoryTags = [
    "healthcare",
    "church",
    "corporate",
    "fitness",
    "hospitality",
    "security",
    "retail",
    "events",
    "trades",
    "education",
  ];
  if (!categoryTags.some((tag) => tags.includes(tag))) {
    tags.push("general");
  }

  return [...new Set(tags)];
}

function suggestChurchTags(title, productType) {
  const tags = ["church", "ministry"];

  if (productType === "Church & Congregation") {
    const t = title.toLowerCase();
    if (t.includes("desk sign") || t.includes("name plate") || t.includes("nameplate")) {
      tags.push(...suggestDeskSignTags(title));
    } else {
      tags.push(...suggestRoleBadgeTags(title, productType));
    }
    return [...new Set(tags)];
  }

  return tags;
}

function suggestTags(title, productType) {
  const type = (productType || "").trim();

  if (type === "Desk Name Plates") {
    return suggestDeskSignTags(title);
  }
  if (type === "Role Badges") {
    return suggestRoleBadgeTags(title, type);
  }
  if (type === "Church & Congregation") {
    return suggestChurchTags(title, type);
  }
  if (type === "Name Tag Blanks") {
    return ["blank-name-tag", "name-tag-blank"];
  }
  if (type === "Custom Name Badges") {
    return ["custom-name-badge"];
  }
  if (type === "Badge Accessories") {
    return ["badge-accessory"];
  }

  const t = title.toLowerCase();
  if (t.includes("desk sign") || t.includes("nameplate") || t.includes("name plate")) {
    return suggestDeskSignTags(title);
  }
  if (t.includes("name tag") || t.includes("name badge") || t.includes("badge")) {
    return suggestRoleBadgeTags(title, type);
  }

  return ["general"];
}

const raw = readFileSync(csvPath, "utf8");
const table = parseCsv(raw);
const header = table[0];
const handleIdx = header.indexOf("Handle");
const titleIdx = header.indexOf("Title");
const typeIdx = header.indexOf("Type");
const tagsIdx = header.indexOf("Tags");

if (handleIdx === -1 || titleIdx === -1 || tagsIdx === -1) {
  console.error("CSV missing Handle, Title, or Tags column");
  process.exit(1);
}

const productMeta = new Map();
for (let i = 1; i < table.length; i++) {
  const row = table[i];
  const handle = row[handleIdx]?.trim();
  if (!handle) continue;
  if (!productMeta.has(handle)) {
    productMeta.set(handle, {
      title: row[titleIdx] || "",
      type: row[typeIdx] || "",
      existingTags: parseTags(row[tagsIdx]),
      firstRowIndex: i,
    });
  }
}

const reviewRows = [
  ["Handle", "Title", "Type", "Current Tags", "Suggested Tags", "Merged Tags"],
];
const stats = {};

for (const [handle, meta] of productMeta.entries()) {
  const suggested = suggestTags(meta.title, meta.type);
  const merged = mergeTags(meta.existingTags, suggested);
  reviewRows.push([
    handle,
    meta.title,
    meta.type,
    meta.existingTags.join(", "),
    suggested.join(", "),
    merged.join(", "),
  ]);

  for (const tag of suggested) {
    stats[tag] = (stats[tag] || 0) + 1;
  }
}

const taggedExport = table.map((row, index) => {
  if (index === 0) return row;
  const handle = row[handleIdx]?.trim();
  if (!handle || !productMeta.has(handle)) return row;

  const meta = productMeta.get(handle);
  if (index !== meta.firstRowIndex) return row;

  const merged = mergeTags(
    meta.existingTags,
    suggestTags(meta.title, meta.type),
  );
  const next = [...row];
  next[tagsIdx] = merged.join(", ");
  return next;
});

const base = csvPath.replace(/\.csv$/i, "");
const reviewPath = `${base}-suggested-tags.csv`;
const exportPath = `${base}-tagged-export.csv`;

writeFileSync(reviewPath, writeCsv(reviewRows));
writeFileSync(exportPath, writeCsv(taggedExport));

console.error(`Products tagged: ${productMeta.size}`);
console.error(`Wrote ${reviewPath}`);
console.error(`Wrote ${exportPath}`);
console.error("\nSuggested tag counts:");
Object.entries(stats)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([tag, count]) => console.error(`  ${count}\t${tag}`));
