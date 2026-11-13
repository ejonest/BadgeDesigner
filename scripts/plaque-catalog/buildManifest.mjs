/**
 * Build the plaque catalog seed from app/temp/Plaque Preview Images.
 *
 *   node scripts/plaque-catalog/buildManifest.mjs
 *   node scripts/plaque-catalog/buildManifest.mjs --apply
 *
 * The default run only writes app/data/plaqueCatalog.seed.json.
 * --apply uploads each photo to the plaque-images bucket and upserts published
 * rows. It refuses to publish when the dry-run finds a missing or duplicate variant.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(root, "app/temp/Plaque Preview Images");
const seedPath = path.join(root, "app/data/plaqueCatalog.seed.json");
const bucket = "plaque-images";

const PLATES = ["black-white", "white-black", "gold", "silver", "full-color"];
const FRAMES = ["wood", "black"];

function standardFormat(id, name, description) {
  return {
    id,
    name,
    description,
    border: "thick",
    layoutEngine: "classic-fixed",
    slots: [
      { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
      {
        kind: "user",
        userIndex: 0,
        placeholder: "YOUR NAME HERE",
        editorLabel: "Recipient name",
        sizeMul: 1.18,
        bold: true,
        uppercase: true,
      },
      {
        kind: "user",
        userIndex: 1,
        placeholder: "Your custom text here",
        editorLabel: "Award line 1",
        sizeMul: 0.82,
      },
      { kind: "divider", style: "whisker" },
      {
        kind: "user",
        userIndex: 2,
        placeholder: "Your custom text here",
        editorLabel: "Award line 2",
        sizeMul: 0.82,
      },
      {
        kind: "user",
        userIndex: 3,
        placeholder: "Date here",
        editorLabel: "Date",
        sizeMul: 0.78,
      },
    ],
  };
}

const DESIGNS = [
  {
    folder: "Church",
    slug: "church",
    name: "Church and religion",
    category: "Church",
    sort: 10,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "black-white",
    defaultFrame: "wood",
    description: "Religious emblem on a full metal plate.",
    format: standardFormat(
      "plaque-catalog-church",
      "Church and religion",
      "Presented-to plate. The religious emblem is the catalog artwork; the customer edits the wording.",
    ),
  },
  {
    folder: "Logo Plaques",
    slug: "logo",
    name: "Your logo",
    category: "Logo",
    sort: 20,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "black-white",
    defaultFrame: "wood",
    description: "Room on the plate for your logo.",
    format: standardFormat(
      "plaque-catalog-logo",
      "Your logo",
      "Presented-to plate with space above the wording for an uploaded logo.",
    ),
  },
  {
    folder: "Teacher Plaque",
    slug: "teacher",
    name: "Teacher recognition",
    category: "Teacher",
    sort: 30,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "black-white",
    defaultFrame: "wood",
    description: "Teacher recognition on a full metal plate.",
    format: standardFormat(
      "plaque-catalog-teacher",
      "Teacher recognition",
      "Presented-to plate for a teacher recognition award.",
    ),
  },
  {
    folder: "Thank You For your Service Plaque",
    slug: "service",
    name: "Thank you for your service",
    category: "Service",
    sort: 40,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "black-white",
    defaultFrame: "wood",
    description: "Military and first responders on a full metal plate.",
    format: standardFormat(
      "plaque-catalog-service",
      "Thank you for your service",
      "Presented-to plate for military and first-responder recognition.",
    ),
  },
  {
    folder: "Thank You & Appreciation",
    slug: "appreciation",
    name: "Thank you",
    category: "Appreciation",
    sort: 50,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "black-white",
    defaultFrame: "wood",
    description: "Thank-you artwork on a full metal plate.",
    format: standardFormat(
      "plaque-catalog-appreciation",
      "Thank you",
      "Presented-to plate for gratitude and appreciation awards.",
    ),
  },
  {
    folder: "Your Award Plaque",
    slug: "your-award",
    name: "Your award",
    category: "Awards",
    sort: 60,
    layoutId: "plaque-attached",
    showInAttachedPicker: true,
    defaultPlate: "gold",
    defaultFrame: "wood",
    description: "First, second, and third place award plates.",
    format: standardFormat(
      "plaque-catalog-your-award",
      "Your award",
      "Presented-to plate for a first, second, and third place award set.",
    ),
  },
  {
    folder: "In Loving Memory Photo Plaque",
    slug: "in-loving-memory",
    name: "In loving memory",
    category: "Memorial",
    sort: 70,
    layoutId: "plaque-detached-landscape",
    showInAttachedPicker: false,
    defaultPlate: "gold",
    defaultFrame: "wood",
    description: "Photo opening on the wood, with a separate memorial plate.",
    format: {
      id: "plaque-catalog-in-loving-memory",
      name: "In loving memory",
      description: "Photo plaque. The opening is printed separately from the memorial plate.",
      border: "victorian",
      layoutEngine: "classic-fixed",
      slots: [
        { kind: "static", text: "In Loving Memory", sizeMul: 0.7, italic: true },
        { kind: "static", text: "of", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "Name",
          editorLabel: "Name",
          sizeMul: 0.9,
        },
      ],
    },
  },
];

export function normalizePlate(token) {
  const value = String(token || "").trim().toLowerCase();
  if (value === "gold" || value === "brushed-gold") return "gold";
  if (value === "silver" || value === "brushed-silver") return "silver";
  if (PLATES.includes(value)) return value;
  return null;
}

export function parseVariant(fileName, slug) {
  if (slug === "in-loving-memory") {
    return /black/i.test(fileName)
      ? { plate: "black-white", frame: "black" }
      : { plate: "gold", frame: "wood" };
  }
  const frame = /Black-Frame/i.test(fileName) ? "black" : "wood";
  const finish = fileName.match(
    /\((brushed-gold|brushed-silver|black-white|white-black|full-color|gold|silver)\)/i,
  );
  const plate = normalizePlate(finish?.[1]);
  if (!plate || !FRAMES.includes(frame)) {
    throw new Error(`Could not read plate/frame from ${fileName}`);
  }
  return { plate, frame };
}

export function buildCatalog(sourceDirectory = sourceRoot) {
  const errors = [];
  const designs = DESIGNS.map((design) => {
    const folder = path.join(sourceDirectory, design.folder);
    if (!existsSync(folder)) {
      errors.push(`Missing folder ${design.folder}`);
      return { ...design, variants: [] };
    }
    const files = readdirSync(folder).filter((name) => /\.jpe?g$/i.test(name));
    const variants = [];
    const seen = new Set();
    for (const fileName of files) {
      try {
        const parsed = parseVariant(fileName, design.slug);
        const key = `${parsed.frame}:${parsed.plate}`;
        if (seen.has(key)) {
          errors.push(`${design.slug} has two ${key} photos (${fileName})`);
          continue;
        }
        seen.add(key);
        variants.push({
          plate: parsed.plate,
          frame: parsed.frame,
          width: 400,
          height: 400,
          sourceFile: path.posix.join(design.folder, fileName),
          storagePath: `catalog/${design.slug}/${parsed.frame}-${parsed.plate}.jpg`,
          imageUrl: `/api/plaque-catalog-asset?slug=${encodeURIComponent(design.slug)}&plate=${parsed.plate}&frame=${parsed.frame}`,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    variants.sort((a, b) => a.frame.localeCompare(b.frame) || a.plate.localeCompare(b.plate));
    const representative = variants.find(
      (variant) => variant.plate === design.defaultPlate && variant.frame === design.defaultFrame,
    );
    if (!representative) {
      errors.push(`${design.slug} is missing its ${design.defaultFrame} ${design.defaultPlate} photo`);
    }
    return {
      slug: design.slug,
      name: design.name,
      description: design.description,
      category: design.category,
      sort: design.sort,
      layoutId: design.layoutId,
      showInAttachedPicker: design.showInAttachedPicker,
      defaultPlate: design.defaultPlate,
      defaultFrame: design.defaultFrame,
      schemaVersion: 1,
      format: design.format,
      variants,
    };
  });
  return { schemaVersion: 1, designs, errors };
}

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

async function applyCatalog(catalog) {
  const env = { ...loadEnv(path.join(root, ".env")), ...process.env };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  for (const design of catalog.designs) {
    for (const variant of design.variants) {
      const file = path.join(sourceRoot, variant.sourceFile);
      const body = readFileSync(file);
      const uploaded = await supabase.storage.from(bucket).upload(variant.storagePath, body, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (uploaded.error) throw new Error(`${variant.storagePath}: ${uploaded.error.message}`);
      const { data } = supabase.storage.from(bucket).getPublicUrl(variant.storagePath);
      variant.imageUrl = data.publicUrl;
    }
    const row = {
      slug: design.slug,
      shop_id: "",
      name: design.name,
      description: design.description,
      category: design.category,
      sort: design.sort,
      layout_id: design.layoutId,
      status: "published",
      schema_version: design.schemaVersion,
      default_plate: design.defaultPlate,
      default_frame: design.defaultFrame,
      show_in_attached_picker: design.showInAttachedPicker,
      format: design.format,
      updated_at: new Date().toISOString(),
    };
    const saved = await supabase
      .from("plaque_catalog_designs")
      .upsert(row, { onConflict: "shop_id,slug" })
      .select("id")
      .single();
    if (saved.error) throw new Error(`${design.slug}: ${saved.error.message}`);
    const removed = await supabase.from("plaque_catalog_variants").delete().eq("design_id", saved.data.id);
    if (removed.error) throw new Error(`${design.slug} variants: ${removed.error.message}`);
    const inserted = await supabase.from("plaque_catalog_variants").insert(
      design.variants.map((variant) => ({
        design_id: saved.data.id,
        plate: variant.plate,
        frame: variant.frame,
        storage_path: variant.storagePath,
        image_url: variant.imageUrl,
        width: variant.width,
        height: variant.height,
      })),
    );
    if (inserted.error) throw new Error(`${design.slug} variants: ${inserted.error.message}`);
  }
}

async function main() {
  const catalog = buildCatalog();
  const photos = catalog.designs.reduce((sum, design) => sum + design.variants.length, 0);
  if (catalog.errors.length > 0) {
    console.error(catalog.errors.join("\n"));
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  let publishedRows = false;
  if (apply) {
    try {
      await applyCatalog(catalog);
      publishedRows = true;
    } catch (error) {
      const uploaded = catalog.designs.some((design) =>
        design.variants.some((variant) => variant.imageUrl.startsWith("http")),
      );
      if (!uploaded) throw error;
      console.error(error instanceof Error ? error.message : error);
      console.error("Photos were uploaded. Database rows were not saved. Apply the SQL migration, then run --apply again.");
    }
  }
  const { errors: _errors, ...seed } = catalog;
  writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(
    `${publishedRows ? "Published" : "Wrote"} ${catalog.designs.length} designs, ${photos} photos → ${path.relative(root, seedPath)}`,
  );
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
