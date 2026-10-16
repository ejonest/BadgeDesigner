import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repoRoot, "app", "temp");
const outputRoot = join(repoRoot, "public", "sign-finishes");
const catalogPath = join(repoRoot, "app", "data", "signFinishCatalog.generated.ts");

/**
 * Preview folders that correspond to an existing sign shape. Folders such as
 * Triangle and Diamond are intentionally omitted until those geometries exist
 * in the designer. Arrow's left-facing photos are omitted because its current
 * SVG die points right. Triangle and Diamond use the supplied preview photos
 * with a matching one-size die.
 */
const sources = [
  ["Core Stock Colors Preview Signs/Classic Framed", "classic-framed", "Core colors"],
  ["Core Stock Colors Preview Signs/Standard", "standard", "Core colors"],
  ["Core Stock Colors Preview Signs/Fancy", "fancy", "Core colors"],
  ["Core Stock Colors Preview Signs/Designer", "designer-heart", "Core colors"],
  ["Core Stock Colors Preview Signs/Basic", "basic", "Core colors"],
  ["Core Stock Colors Preview Signs/Circle", "circle", "Core colors"],
  ["Core Stock Colors Preview Signs/Square", "square", "Core colors"],
  ["Core Stock Colors Preview Signs/Oval", "oval", "Core colors"],
  ["Core Stock Colors Preview Signs/Portrait Round", "portrait", "Core colors"],
  ["Core Stock Colors Preview Signs/Victorian", "victorian", "Core colors"],
  ["Core Stock Colors Preview Signs/Notched Standard", "notched", "Core colors"],
  ["Core Stock Colors Preview Signs/Door Hanger", "door-hanger", "Core colors"],
  ["Core Stock Colors Preview Signs/Headstone", "headstone-basic", "Core colors"],
  ["Core Stock Colors Preview Signs/Heritage", "vintage", "Core colors"],
  ["Core Stock Colors Preview Signs/Western", "western-elegant", "Core colors"],
  ["Multi-Color Signs Preview Signs/Classic Framed Rustic Wood", "classic-framed", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Heritage Rustic Wood", "vintage", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Oval Rustic Wood", "oval", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Custom Door Hanger", "door-hanger", "Rustic & pastel"],
  ["Multi-Color Signs Preview Signs/Frontier Rustic Wood", "frontier-elegant", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Arrow Rustic Wood", "arrow", "Rustic wood", /-Right-/i],
  ["Multi-Color Signs Preview Signs/Circle Rustic Wood", "circle", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Headstone Rustic Wood", "headstone-basic", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Victorian Rustic Wood", "victorian", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Standard Floral Colors", "standard", "Floral"],
  ["Core Stock Colors Preview Signs/Triangle", "triangle", "Core colors"],
  ["Multi-Color Signs Preview Signs/Triangle Warning Colors", "triangle", "Warning colors"],
  ["Multi-Color Signs Preview Signs/Diamond Rustic Wood", "diamond", "Rustic wood"],
  ["Multi-Color Signs Preview Signs/Diamond Warning Colors", "diamond", "Warning colors"],
];

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bNavy Blue\b/g, "Navy blue")
    .replace(/\bLight Grey\b/g, "Light grey")
    .replace(/\bDark Brown\b/g, "Dark brown");
}

function finishNameFromFile(fileName, group) {
  const stem = basename(fileName, extname(fileName));
  const lower = stem.toLowerCase();

  const previewImage = lower.lastIndexOf("preview-image-");
  if (previewImage >= 0) {
    return stem.slice(previewImage + "preview-image-".length);
  }

  const parenthetical = [...stem.matchAll(/\(([^)]+)\)/g)];
  if (parenthetical.length > 0) {
    return parenthetical[parenthetical.length - 1][1];
  }

  if (lower.startsWith("custom-signs-designer_")) {
    return stem
      .slice("custom-signs-designer_".length)
      .replace(/-main$/i, "");
  }

  if (group === "Floral") {
    return stem
      .replace(/^standard-plus-/i, "")
      .replace(/-(?:custom-)?wall-or-door-sign.*$/i, "");
  }

  if (lower.startsWith("custom-door-hanger-")) {
    return stem
      .replace(/^custom-door-hanger-/i, "")
      .replace(/-main(?:-400x400)?$/i, "");
  }

  const rustic = stem.match(/Rustic-(.+?)-Wood(?:-|$)/i);
  if (rustic) return rustic[1];

  return stem
    .replace(/-main(?:-preview)?(?:-400x400)?$/i, "")
    .replace(/-400x400(?:-preview)?$/i, "");
}

function colorsForFinish(id) {
  const darkInk = "#0D1B2A";
  let backgroundColor = "#FFFFFF";
  let inkColor = darkInk;

  if (/^(black|dark-blue|navy|navy-blue|dark-brown|walnut|red)(-|$)/.test(id)) {
    backgroundColor =
      id.startsWith("black")
        ? "#111111"
        : id.startsWith("red")
          ? "#B7292F"
          : id.startsWith("dark-brown") || id.startsWith("walnut")
            ? "#4A2C20"
            : "#17365D";
  } else if (/^(blue|light-blue|pastel-blue)/.test(id)) {
    backgroundColor = "#4E8CBF";
  } else if (/^(yellow)/.test(id)) {
    backgroundColor = "#F4D13D";
  } else if (/^(amber)/.test(id)) {
    backgroundColor = "#E6A317";
  } else if (/^(orange)/.test(id)) {
    backgroundColor = "#E67E22";
  } else if (/^(ivory|beige|light-timber|light-wood|pale-wood)/.test(id)) {
    backgroundColor = "#E8DCC2";
  } else if (/^dark-red/.test(id)) {
    backgroundColor = "#7A1F24";
  } else if (/brushed-gold/.test(id)) {
    backgroundColor = "#C9A45C";
  } else if (/brushed-silver|light-grey|grey-wood/.test(id)) {
    backgroundColor = "#C6C8CA";
  }

  if (
    /(?:black-white|blue-white|navy(?:-blue)?-white|red-white|dark-brown-white|walnut-white)$/.test(
      id,
    )
  ) {
    inkColor = "#FFFFFF";
  } else if (/(?:black-gold|navy(?:-blue)?-gold)$/.test(id)) {
    inkColor = "#C8962A";
  } else if (/black-orange$/.test(id)) {
    inkColor = "#E67E22";
  } else if (/black-yellow$/.test(id)) {
    inkColor = "#F4D13D";
  } else if (/dark-red-white$/.test(id)) {
    inkColor = "#FFFFFF";
  } else if (/yellow-crimson$/.test(id)) {
    inkColor = "#9B2335";
  } else if (/yellow-navy$/.test(id)) {
    inkColor = "#17365D";
  } else if (/beige-dark-brown$/.test(id)) {
    inkColor = "#4A2C20";
  } else if (/white-red$/.test(id)) {
    inkColor = "#C0392B";
  } else if (/white-blue$/.test(id)) {
    inkColor = "#1A5C8E";
  }

  return { backgroundColor, inkColor };
}

function cropCandidates(input, negate) {
  const filter = `${negate ? "negate," : ""}cropdetect=limit=0.04:round=2:reset=0`;
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loop",
      "1",
      "-framerate",
      "2",
      "-i",
      input,
      "-vf",
      filter,
      "-frames:v",
      "5",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return String(result.stderr ?? "").match(/crop=\d+:\d+:\d+:\d+/g) ?? [];
}

function bestCrop(input) {
  const candidates = [
    ...cropCandidates(input, false),
    ...cropCandidates(input, true),
  ];
  const parsed = candidates
    .map((candidate) => candidate.replace("crop=", "").split(":").map(Number))
    .filter(([w, h]) => w >= 20 && h >= 20);
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a[0] * a[1] - b[0] * b[1]);
  return parsed[0].join(":");
}

function writeOptimizedFinish(input, output) {
  mkdirSync(dirname(output), { recursive: true });
  const crop = bestCrop(input);
  const filters = crop ? ["-vf", `crop=${crop}`] : [];
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      ...filters,
      "-q:v",
      "2",
      "-y",
      output,
    ],
    { stdio: "inherit" },
  );
}

if (!existsSync(sourceRoot)) {
  throw new Error(`Missing source directory: ${sourceRoot}`);
}

rmSync(outputRoot, { recursive: true, force: true });

const catalog = [];
const usedIds = new Set();

for (const [sourceDir, shapeTypeId, group, includePattern] of sources) {
  const absoluteDir = join(sourceRoot, sourceDir);
  if (!existsSync(absoluteDir)) {
    console.warn(`[sign-finishes] Missing folder: ${sourceDir}`);
    continue;
  }
  const files = readdirSync(absoluteDir)
    .filter((file) => imageExtensions.has(extname(file).toLowerCase()))
    .filter((file) => !includePattern || includePattern.test(file))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const rawName = finishNameFromFile(file, group);
    const finishSlug = slugify(rawName);
    let id = `${shapeTypeId}-${finishSlug}`;
    if (usedIds.has(id)) id = `${id}-${slugify(group)}`;
    usedIds.add(id);

    const outputRelative = join("sign-finishes", shapeTypeId, `${id}.jpg`);
    const output = join(repoRoot, "public", outputRelative);
    const input = join(absoluteDir, file);
    writeOptimizedFinish(input, output);

    catalog.push({
      id,
      shapeTypeId,
      label: titleCase(rawName),
      group,
      imageSrc: `/${outputRelative.split("\\").join("/")}`,
      ...colorsForFinish(finishSlug),
    });
  }
}

catalog.sort(
  (a, b) =>
    a.shapeTypeId.localeCompare(b.shapeTypeId) ||
    a.group.localeCompare(b.group) ||
    a.label.localeCompare(b.label),
);

writeFileSync(
  catalogPath,
  `// Generated by scripts/generate-sign-finishes.mjs\nexport default ${JSON.stringify(
    { version: 1, finishes: catalog },
    null,
    2,
  )} as const;\n`,
);

const shapeCount = new Set(catalog.map((finish) => finish.shapeTypeId)).size;
console.log(
  `[sign-finishes] Wrote ${catalog.length} finishes across ${shapeCount} shapes.`,
);
console.log(`[sign-finishes] Catalog: ${relative(repoRoot, catalogPath)}`);
