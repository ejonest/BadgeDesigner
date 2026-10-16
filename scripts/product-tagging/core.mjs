import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function stripHtml(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity[0] === "#") {
        const hexadecimal = entity[1]?.toLowerCase() === "x";
        const valueText = entity.slice(hexadecimal ? 2 : 1);
        const codePoint = Number.parseInt(valueText, hexadecimal ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : " ";
      }
      return HTML_ENTITIES[entity.toLowerCase()] ?? " ";
    });
}

export function normalizeText(value = "") {
  return stripHtml(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "-");
}

export function parseTags(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function uniqueTags(tags) {
  const seen = new Set();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeManagedTags(currentTags, proposedManagedTags, managedPrefix) {
  const prefix = managedPrefix.toLowerCase();
  const unmanaged = parseTags(currentTags).filter(
    (tag) => !tag.toLowerCase().startsWith(prefix),
  );
  return uniqueTags([...unmanaged, ...parseTags(proposedManagedTags)]);
}

export async function loadTaxonomy(path) {
  const taxonomy = JSON.parse(await readFile(path, "utf8"));
  validateTaxonomy(taxonomy);
  return taxonomy;
}

export function validateTaxonomy(taxonomy) {
  if (!taxonomy || typeof taxonomy !== "object") throw new Error("Taxonomy must be an object.");
  if (!taxonomy.taxonomyVersion) throw new Error("Taxonomy needs taxonomyVersion.");
  if (!taxonomy.managedPrefix) throw new Error("Taxonomy needs managedPrefix.");
  if (!Array.isArray(taxonomy.rules) || taxonomy.rules.length === 0) {
    throw new Error("Taxonomy needs at least one rule.");
  }
  const ids = new Set();
  for (const rule of taxonomy.rules) {
    if (!["category", "industry", "family"].includes(rule.kind)) {
      throw new Error(`Unsupported rule kind: ${rule.kind}`);
    }
    if (!rule.id || ids.has(`${rule.kind}:${rule.id}`)) {
      throw new Error(`Missing or duplicate rule: ${rule.kind}:${rule.id}`);
    }
    ids.add(`${rule.kind}:${rule.id}`);
    if (!Array.isArray(rule.keywords) || rule.keywords.length === 0) {
      throw new Error(`Rule ${rule.id} needs keywords.`);
    }
  }
}

function containsPhrase(normalizedHaystack, rawNeedle) {
  const needle = normalizeText(rawNeedle);
  if (!needle) return false;
  const padded = ` ${normalizedHaystack} `;
  if (padded.includes(` ${needle} `)) return true;
  const words = needle.split(" ");
  const last = words.at(-1);
  if (!last || last.endsWith("s")) return false;
  const plural = [...words.slice(0, -1), `${last}s`].join(" ");
  return padded.includes(` ${plural} `);
}

export function extractMessage(value = "", cuts = []) {
  let text = String(value);
  for (const cut of cuts) {
    const marker = String(cut);
    if (!marker) continue;
    const index = text.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0) text = text.slice(0, index);
  }
  return text;
}

function stripPhrases(normalized, phrases = []) {
  let text = ` ${normalized} `;
  const ordered = phrases
    .map((phrase) => normalizeText(phrase))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const phrase of ordered) {
    text = text.replaceAll(` ${phrase} `, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function stripStylePrefixes(normalized, prefixes = []) {
  const ordered = prefixes
    .map((prefix) => normalizeText(prefix))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  let text = normalized;
  for (let guard = 0; guard < 8; guard += 1) {
    const match = ordered.find((prefix) => text === prefix || text.startsWith(`${prefix} `));
    if (!match) break;
    text = text.slice(match.length).trim();
  }
  return text;
}

function prepareMatchText(value, taxonomy, { stripStyles = false } = {}) {
  const cleanup = taxonomy.textCleanup ?? {};
  const message = extractMessage(value, cleanup.cutAt ?? []);
  const stripped = stripPhrases(normalizeText(message), cleanup.ignoredPhrases ?? []);
  return stripStyles ? stripStylePrefixes(stripped, cleanup.stylePrefixes ?? []) : stripped;
}

function fieldMatches(field, keywords) {
  return keywords.filter((keyword) => containsPhrase(field, keyword));
}

export function classifyProduct(product, taxonomy) {
  validateTaxonomy(taxonomy);
  const fields = {
    handle: normalizeText(product.handle),
    title: prepareMatchText(product.title, taxonomy, { stripStyles: true }),
    productType: normalizeText(product.productType ?? product.type),
    description: prepareMatchText(product.descriptionHtml ?? product.description, taxonomy),
    vendor: normalizeText(product.vendor),
    tags: normalizeText(parseTags(product.tags).join(" ")),
  };
  const scopeText = [
    normalizeText(product.title),
    normalizeText(product.handle),
    fields.productType,
    normalizeText(product.descriptionHtml ?? product.description),
    fields.vendor,
    fields.tags,
  ].join(" ");
  const scopeExclusions = fieldMatches(scopeText, taxonomy.scope?.exclude ?? []);
  if (scopeExclusions.length > 0) {
    return {
      confidence: "out-of-scope",
      conflicts: [],
      score: 0,
      matchedRules: [],
      managedTags: [],
      reasons: [`scope exclusion: ${scopeExclusions.join(" | ")}`],
    };
  }
  const minimumScore = Number(taxonomy.minimumScore ?? 3);
  const matchedRules = [];

  for (const rule of taxonomy.rules) {
    const excluded = fieldMatches(`${fields.title} ${fields.description}`, rule.exclude ?? []);
    if (excluded.length > 0) continue;

    const evidence = [];
    let score = 0;
    // Titles carry the sign message. Descriptions repeat it after boilerplate is
    // removed. Product type and existing tags are style or collection labels.
    const weights = { title: 4, description: 1 };
    for (const [field, weight] of Object.entries(weights)) {
      const matches = fieldMatches(fields[field], rule.keywords);
      if (matches.length > 0) {
        score += weight + Math.min(matches.length - 1, 2);
        evidence.push(`${field}: ${matches.join(" | ")}`);
      }
    }
    if (score >= minimumScore) matchedRules.push({ ...rule, score, evidence });
  }

  matchedRules.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const maxScore = matchedRules[0]?.score ?? 0;
  const matchedKeys = new Set(matchedRules.map((rule) => `${rule.kind}:${rule.id}`));
  const conflicts = uniqueTags(
    matchedRules.flatMap((rule) =>
      (rule.conflictsWith ?? [])
        .filter((conflict) => matchedKeys.has(conflict))
        .map((conflict) => `${rule.kind}:${rule.id} conflicts with ${conflict}`),
    ),
  );
  const confidence =
    conflicts.length > 0
      ? "conflict"
      : maxScore >= 5
        ? "high"
        : maxScore >= minimumScore
          ? "medium"
          : "unclassified";
  const prefix = taxonomy.managedPrefix;
  const searchLimit = Math.max(0, Number(taxonomy.searchAliasesPerRule ?? 0));
  const managedTags = [];
  for (const rule of matchedRules) {
    managedTags.push(`${prefix}${rule.kind}:${rule.id}`);
    for (const alias of (rule.searchAliases ?? []).slice(0, searchLimit)) {
      managedTags.push(`${prefix}search:${slugify(alias)}`);
    }
  }

  return {
    confidence,
    conflicts,
    score: maxScore,
    matchedRules: matchedRules.map((rule) => `${rule.kind}:${rule.id}`),
    managedTags: uniqueTags(managedTags),
    reasons: matchedRules.flatMap((rule) =>
      rule.evidence.map((evidence) => `${rule.kind}:${rule.id} <- ${evidence}`),
    ),
  };
}

export function buildProposal(product, taxonomy) {
  const classification = classifyProduct(product, taxonomy);
  const currentTags = parseTags(product.tags);
  const currentManagedTags = currentTags.filter((tag) =>
    tag.toLowerCase().startsWith(taxonomy.managedPrefix.toLowerCase()),
  );
  const finalTags = mergeManagedTags(
    currentTags,
    classification.managedTags,
    taxonomy.managedPrefix,
  );
  const proposedKeys = new Set(classification.managedTags.map((tag) => tag.toLowerCase()));
  const removedManagedTags = currentManagedTags.filter(
    (tag) => !proposedKeys.has(tag.toLowerCase()),
  );

  return {
    productId: product.id,
    handle: product.handle ?? "",
    title: product.title ?? "",
    status: product.status ?? "",
    updatedAt: product.updatedAt ?? "",
    currentTags,
    proposedManagedTags: classification.managedTags,
    removedManagedTags,
    finalTags,
    confidence: classification.confidence,
    conflicts: classification.conflicts,
    score: classification.score,
    matchedRules: classification.matchedRules,
    reasons: classification.reasons,
  };
}

export function buildSynonymGapRows(products, taxonomy) {
  const rows = [];
  for (const group of taxonomy.synonymGroups ?? []) {
    const counts = Object.fromEntries(group.map((term) => [term, 0]));
    for (const product of products) {
      const text = normalizeText(
        `${product.title ?? ""} ${stripHtml(product.descriptionHtml ?? product.description ?? "")}`,
      );
      for (const term of group) {
        if (containsPhrase(text, term)) counts[term]++;
      }
    }
    rows.push({
      group: group.join(" | "),
      populatedTerms: Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([term, count]) => `${term} (${count})`)
        .join(" | "),
      missingTerms: Object.entries(counts)
        .filter(([, count]) => count === 0)
        .map(([term]) => term)
        .join(" | "),
      recommendation: `Configure as one synonym group in Shopify Search & Discovery: ${group.join(", ")}`,
    });
  }
  return rows;
}

export function chunkJsonlByBytes(records, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive safe integer.");
  }
  const chunks = [];
  let lines = [];
  let bytes = 0;
  for (const record of records) {
    const line = `${JSON.stringify(record)}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > maxBytes) {
      throw new Error(`A single JSONL record is ${lineBytes} bytes, above the ${maxBytes} byte limit.`);
    }
    if (lines.length > 0 && bytes + lineBytes > maxBytes) {
      chunks.push(lines.join(""));
      lines = [];
      bytes = 0;
    }
    lines.push(line);
    bytes += lineBytes;
  }
  if (lines.length > 0) chunks.push(lines.join(""));
  return chunks;
}
