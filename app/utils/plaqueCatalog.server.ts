import path from "node:path";
import { readFileSync } from "node:fs";

import { parsePlaqueAwardFormatSnapshot } from "~/constants/plaqueFormats";
import { supabaseAdmin } from "~/utils/supabase";
import {
  PLAQUE_CATALOG_FRAMES,
  PLAQUE_CATALOG_PLATES,
  type PlaqueCatalogDesign,
  type PlaqueCatalogFrame,
  type PlaqueCatalogPlate,
  type PlaqueCatalogSeed,
  type PlaqueCatalogSeedDesign,
} from "~/utils/plaqueCatalog";
import seedJson from "~/data/plaqueCatalog.seed.json";

const seed = seedJson as PlaqueCatalogSeed;
const SOURCE_ROOT = path.resolve(process.cwd(), "app/temp/Plaque Preview Images");

function isPlate(value: string): value is PlaqueCatalogPlate {
  return (PLAQUE_CATALOG_PLATES as readonly string[]).includes(value);
}

function isFrame(value: string): value is PlaqueCatalogFrame {
  return (PLAQUE_CATALOG_FRAMES as readonly string[]).includes(value);
}

function assetUrl(slug: string, plate: PlaqueCatalogPlate, frame: PlaqueCatalogFrame): string {
  const params = new URLSearchParams({ slug, plate, frame });
  return `/api/plaque-catalog-asset?${params.toString()}`;
}

function publicDesign(design: PlaqueCatalogSeedDesign): PlaqueCatalogDesign | null {
  const format = parsePlaqueAwardFormatSnapshot(design.format);
  if (!format || !isPlate(design.defaultPlate) || !isFrame(design.defaultFrame)) return null;
  const variants = design.variants.flatMap((variant) => {
    if (!isPlate(variant.plate) || !isFrame(variant.frame)) return [];
    const imageUrl = variant.imageUrl?.startsWith("http")
      ? variant.imageUrl
      : assetUrl(design.slug, variant.plate, variant.frame);
    return [{
      plate: variant.plate,
      frame: variant.frame,
      imageUrl,
      width: variant.width || 400,
      height: variant.height || 400,
    }];
  });
  if (variants.length === 0) return null;
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
    schemaVersion: design.schemaVersion || 1,
    format,
    variants,
  };
}

export function plaqueCatalogSeedDesigns(): PlaqueCatalogDesign[] {
  return seed.designs.flatMap((design) => {
    const parsed = publicDesign(design);
    return parsed ? [parsed] : [];
  });
}

type DbVariant = {
  plate?: string;
  frame?: string;
  image_url?: string;
  width?: number;
  height?: number;
};

type DbDesign = {
  slug?: string;
  shop_id?: string;
  name?: string;
  description?: string;
  category?: string;
  sort?: number;
  layout_id?: string;
  schema_version?: number;
  default_plate?: string;
  default_frame?: string;
  show_in_attached_picker?: boolean;
  format?: unknown;
  plaque_catalog_variants?: DbVariant[] | null;
};

function fromDatabaseRow(row: DbDesign): PlaqueCatalogDesign | null {
  const format = parsePlaqueAwardFormatSnapshot(row.format);
  if (!row.slug || !row.name || !format) return null;
  if (!row.default_plate || !isPlate(row.default_plate)) return null;
  if (!row.default_frame || !isFrame(row.default_frame)) return null;
  const variants = (row.plaque_catalog_variants ?? []).flatMap((variant) => {
    if (!variant.plate || !variant.frame || !variant.image_url) return [];
    if (!isPlate(variant.plate) || !isFrame(variant.frame)) return [];
    return [{
      plate: variant.plate,
      frame: variant.frame,
      imageUrl: variant.image_url,
      width: variant.width || 400,
      height: variant.height || 400,
    }];
  });
  if (variants.length === 0) return null;
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    category: row.category ?? "",
    sort: row.sort ?? 0,
    layoutId: row.layout_id ?? "plaque-attached",
    showInAttachedPicker: Boolean(row.show_in_attached_picker),
    defaultPlate: row.default_plate,
    defaultFrame: row.default_frame,
    schemaVersion: row.schema_version || 1,
    format,
    variants,
  };
}

function preferShop(rows: PlaqueCatalogDesign[], shopRows: PlaqueCatalogDesign[]): PlaqueCatalogDesign[] {
  const overridden = new Set(shopRows.map((design) => design.slug));
  return [...shopRows, ...rows.filter((design) => !overridden.has(design.slug))].sort(
    (a, b) => a.sort - b.sort || a.name.localeCompare(b.name),
  );
}

/**
 * Published catalog. Database rows win; the checked-in seed keeps the iframe usable
 * before the migration has been applied.
 */
export async function loadPublishedPlaqueCatalog(shopId = ""): Promise<{
  source: "database" | "seed";
  designs: PlaqueCatalogDesign[];
}> {
  const shop = shopId.trim();
  if (supabaseAdmin) {
    const query = supabaseAdmin
      .from("plaque_catalog_designs")
      .select(
        "slug,shop_id,name,description,category,sort,layout_id,schema_version,default_plate,default_frame,show_in_attached_picker,format,plaque_catalog_variants(plate,frame,image_url,width,height)",
      )
      .eq("status", "published")
      .in("shop_id", shop ? ["", shop] : [""])
      .order("sort", { ascending: true });
    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      const parsed = (data as DbDesign[]).flatMap((row) => {
        const design = fromDatabaseRow(row);
        return design ? [{ design, shopId: row.shop_id ?? "" }] : [];
      });
      const globals = parsed.filter((row) => row.shopId === "").map((row) => row.design);
      const shopSpecific = parsed.filter((row) => shop && row.shopId === shop).map((row) => row.design);
      const designs = preferShop(globals, shopSpecific);
      if (designs.length > 0) return { source: "database", designs };
    }
  }
  return { source: "seed", designs: plaqueCatalogSeedDesigns() };
}

export function findPlaqueCatalogSeedVariant(slug: string, plate: string, frame: string) {
  const design = seed.designs.find((item) => item.slug === slug);
  if (!design || !isPlate(plate) || !isFrame(frame)) return null;
  const variant = design.variants.find((item) => item.plate === plate && item.frame === frame);
  if (!variant?.sourceFile) return null;
  const file = path.resolve(SOURCE_ROOT, variant.sourceFile);
  if (file !== SOURCE_ROOT && !file.startsWith(`${SOURCE_ROOT}${path.sep}`)) return null;
  return file;
}

export function readPlaqueCatalogAsset(file: string): Buffer {
  return readFileSync(file);
}
