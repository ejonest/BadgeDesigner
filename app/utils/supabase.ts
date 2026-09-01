import { createClient } from "@supabase/supabase-js";
import type { Badge } from "~/types/badge";
import {
  BACKGROUND_COLORS,
  EXTENDED_BACKGROUND_COLORS,
  SMART_PALETTE_COLORS,
  FONT_COLORS,
} from "~/constants/colors";
import { DESIGN_LIBRARY_MILESTONE_LIMIT } from "~/constants/designLibrary";
import type { SignLikeDesignsTable } from "~/config/designers";
import { stableAutosaveDesignId } from "./stableDesignLibraryIds";
import {
  formatDeskSignAttachmentMethod,
  formatDeskSignOrderFinish,
} from "./deskSignRender";
import { formatGavelOrderFinish } from "~/constants/gavelStyles";

export { stableAutosaveDesignId, DESIGN_LIBRARY_MILESTONE_LIMIT };

// Helper function to get current timestamp in PST/PDT (America/Los_Angeles timezone)
// Returns ISO string formatted for PostgreSQL timestamp with time zone
export function getPacificTimestamp(): string {
  const now = new Date();

  // Get Pacific time components
  const pacificParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = pacificParts.find((p) => p.type === "year")?.value || "";
  const month = pacificParts.find((p) => p.type === "month")?.value || "";
  const day = pacificParts.find((p) => p.type === "day")?.value || "";
  const hour = pacificParts.find((p) => p.type === "hour")?.value || "";
  const minute = pacificParts.find((p) => p.type === "minute")?.value || "";
  const second = pacificParts.find((p) => p.type === "second")?.value || "";

  // Calculate timezone offset by comparing UTC and Pacific times
  // Create two formatters to get the same moment in both timezones
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const utcParts = utcFormatter.formatToParts(now);
  const utcYear = parseInt(
    utcParts.find((p) => p.type === "year")?.value || "0",
  );
  const utcMonth =
    parseInt(utcParts.find((p) => p.type === "month")?.value || "0") - 1;
  const utcDay = parseInt(utcParts.find((p) => p.type === "day")?.value || "0");
  const utcHour = parseInt(
    utcParts.find((p) => p.type === "hour")?.value || "0",
  );
  const utcMinute = parseInt(
    utcParts.find((p) => p.type === "minute")?.value || "0",
  );
  const utcSecond = parseInt(
    utcParts.find((p) => p.type === "second")?.value || "0",
  );

  const pacificYear = parseInt(year);
  const pacificMonth = parseInt(month) - 1;
  const pacificDay = parseInt(day);
  const pacificHour = parseInt(hour);
  const pacificMinute = parseInt(minute);
  const pacificSecond = parseInt(second);

  // Create Date objects in UTC representing both times
  const utcDate = new Date(
    Date.UTC(utcYear, utcMonth, utcDay, utcHour, utcMinute, utcSecond),
  );
  const pacificAsUtc = new Date(
    Date.UTC(
      pacificYear,
      pacificMonth,
      pacificDay,
      pacificHour,
      pacificMinute,
      pacificSecond,
    ),
  );

  // Calculate offset in hours (Pacific is behind UTC)
  const offsetMs = pacificAsUtc.getTime() - utcDate.getTime();
  const offsetHours = Math.round(offsetMs / (1000 * 60 * 60));

  // Format offset (Pacific is UTC-8 (PST) or UTC-7 (PDT))
  const offsetSign = offsetHours <= 0 ? "-" : "+";
  const offsetHoursAbs = Math.abs(offsetHours);
  const offsetString = `${offsetSign}${offsetHoursAbs
    .toString()
    .padStart(2, "0")}:00`;

  // Return ISO format: YYYY-MM-DDTHH:MM:SS+/-HH:MM
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetString}`;
}

// Supabase configuration from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.warn(
    "Supabase environment variables are not set. Please configure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
  );
}

// Client-side Supabase client (for browser)
// Only create if we have the required keys
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Server-side Supabase client (for API routes)
// Only create if we have the required keys
export const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

/** Library row kind: autosave = one updatable row per user/shop; milestones are capped (see prune). */
export type DesignSaveKind = "autosave" | "manual" | "cart" | "ordered";

export const DESIGN_MILESTONE_SAVE_KINDS: DesignSaveKind[] = [
  "manual",
  "cart",
  "ordered",
];

// Types for badge designs
export interface BadgeDesign {
  id?: string;
  design_id: string;
  product_id: string;
  shop_id: string;
  user_id?: string;
  background_color?: string;
  backing_price?: number;
  backing_type?: string;
  base_price?: number;
  total_price?: number;
  design_data?: any;
  thumbnail_url?: string;
  full_image_url?: string;
  /** CorelDRAW / print SVG: text + icon + registration shape only (no background art). */
  print_svg_url?: string;
  /** Sign designer: public URL of user-uploaded logo (not SVG export). */
  uploaded_image_url?: string;
  status?: "draft" | "saved" | "ordered" | "archived";
  /** autosave | manual | cart | ordered — see docs/migration_add_save_kind_to_design_tables.sql */
  save_kind?: DesignSaveKind | null;
  created_at?: string;
  updated_at?: string;
}

// Upload helper function
export async function uploadToSupabase(
  file: File,
  designId: string,
  type: "thumbnail" | "full",
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const fileName = `${designId}-${type}.png`;
  const filePath = `${designId}/${fileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from("badge-images")
    .upload(filePath, file, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    console.error("Upload error:", error);
    throw error;
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("badge-images").getPublicUrl(filePath);

  return publicUrl;
}

// Upload from a base64 data URL (e.g. from canvas toDataURL) to badge-images and return public URL.
// Use for Gadget update flow where client sends data URLs; Gadget expects normal URL strings.
export async function uploadDataUrlToBadgeImagesBucket(
  dataUrl: string,
  designId: string,
  fileNameSuffix: string,
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    throw new Error(
      "uploadDataUrlToBadgeImagesBucket expects a data URL starting with data:image/",
    );
  }
  const base64Marker = ";base64,";
  const base64Index = dataUrl.indexOf(base64Marker);
  if (base64Index === -1) {
    throw new Error("Invalid image data URL format: missing ;base64,");
  }
  const contentType = dataUrl.slice(5, base64Index);
  const rawBase64 = dataUrl.slice(base64Index + base64Marker.length);
  const base64 = rawBase64.replace(/\s/g, "");
  if (!base64.length) {
    throw new Error("Invalid image data URL: empty base64 payload");
  }
  const buffer = Buffer.from(base64, "base64");
  const ext = contentType === "image/svg+xml" ? "svg" : "png";
  const fileName = `${designId}/gadget-update-${fileNameSuffix}.${ext}`;
  const blob = new Blob([buffer], { type: contentType });
  return uploadToBadgeImagesBucket(blob, fileName, contentType);
}

// In Node, FormData File/Blob can be stream-backed; convert to Buffer so Supabase gets exact bytes.
async function toUploadBuffer(file: File | Blob): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

// Upload to badge-images bucket - ONLY accepts image files (PNG, etc.)
export async function uploadToBadgeImagesBucket(
  file: File | Blob,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  // Validate that only image files (including SVG) are uploaded to this bucket
  const isImage =
    contentType.startsWith("image/") || contentType === "image/svg+xml";
  const hasImageExtension = fileName.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  if (!isImage && !hasImageExtension) {
    throw new Error(
      `Invalid file type for badge-images bucket. Only image files (including SVG) are allowed. Received: ${contentType}`,
    );
  }

  // First, check if the bucket exists
  const { data: buckets, error: bucketsError } =
    await supabaseAdmin.storage.listBuckets();

  if (bucketsError) {
    console.error("Error listing buckets:", bucketsError);
    throw new Error(
      `Failed to access Supabase storage: ${bucketsError.message}`,
    );
  }

  const badgeImagesBucket = buckets?.find(
    (bucket) => bucket.name === "badge-images",
  );
  if (!badgeImagesBucket) {
    throw new Error(
      "badge-images bucket does not exist. Please create it in your Supabase dashboard under Storage.",
    );
  }

  const filePath = fileName;
  const body = await toUploadBuffer(file);
  console.log(
    `Uploading image to badge-images bucket: ${filePath} (${contentType}, ${body.length} bytes)`,
  );

  const { data, error } = await supabaseAdmin.storage
    .from("badge-images")
    .upload(filePath, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("Upload error details:", {
      message: error.message,
      statusCode: error.statusCode,
      error: error.error,
      fileName: filePath,
    });
    throw new Error(
      `Failed to upload file to badge-images bucket: ${error.message}`,
    );
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("badge-images").getPublicUrl(filePath);

  console.log(`Image uploaded successfully to badge-images: ${publicUrl}`);

  return publicUrl;
}

// Upload to badge-pdfs bucket - ONLY accepts PDF files
export async function uploadToBadgePdfsBucket(
  file: File | Blob,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  // Validate that only PDF files are uploaded to this bucket
  if (
    contentType !== "application/pdf" &&
    !fileName.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(
      `Invalid file type for badge-pdfs bucket. Only PDF files are allowed. Received: ${contentType}`,
    );
  }

  // First, check if the bucket exists
  const { data: buckets, error: bucketsError } =
    await supabaseAdmin.storage.listBuckets();

  if (bucketsError) {
    console.error("Error listing buckets:", bucketsError);
    throw new Error(
      `Failed to access Supabase storage: ${bucketsError.message}`,
    );
  }

  const badgePdfsBucket = buckets?.find(
    (bucket) => bucket.name === "badge-pdfs",
  );
  if (!badgePdfsBucket) {
    throw new Error(
      "badge-pdfs bucket does not exist. Please create it in your Supabase dashboard under Storage.",
    );
  }

  const filePath = fileName;
  const body = await toUploadBuffer(file);
  console.log(
    `Uploading PDF to badge-pdfs bucket: ${filePath} (${contentType}, ${body.length} bytes)`,
  );

  const { data, error } = await supabaseAdmin.storage
    .from("badge-pdfs")
    .upload(filePath, body, {
      contentType: "application/pdf", // Force PDF content type
      upsert: true,
    });

  if (error) {
    console.error("Upload error details:", {
      message: error.message,
      statusCode: error.statusCode,
      error: error.error,
      fileName: filePath,
    });
    throw new Error(
      `Failed to upload file to badge-pdfs bucket: ${error.message}`,
    );
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("badge-pdfs").getPublicUrl(filePath);

  console.log(`PDF uploaded successfully to badge-pdfs: ${publicUrl}`);

  return publicUrl;
}

// Get public URL for a file in Supabase storage (no upload). Use same bucket names and path conventions as uploads.
export function getStoragePublicUrl(bucket: string, path: string): string {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}

/**
 * Download file bytes from a Supabase storage URL using the admin client.
 * Use this server-side when fetch(publicUrl) fails (e.g. private bucket).
 * URL format: .../storage/v1/object/public/<bucket>/<path>
 */
export async function downloadBytesFromStorageUrl(
  url: string,
): Promise<Uint8Array | null> {
  if (!supabaseAdmin) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, bucket, pathWithQuery] = match;
  const path = pathWithQuery.split("?")[0].trim();
  if (!path) return null;
  const decodedPath = decodeURIComponent(path);
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(decodedPath);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Download file bytes from the badge-images bucket by path (no URL parsing).
 * Use for link-order PDF so we always get PNG thumbnails reliably.
 */
export async function downloadFromBadgeImagesBucket(
  designId: string,
  fileName: string,
): Promise<Uint8Array | null> {
  if (!supabaseAdmin) return null;
  const path = `${designId}/${fileName}`;
  const { data, error } = await supabaseAdmin.storage
    .from("badge-images")
    .download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

// Database helper functions
/**
 * Persist one library row. Uses delete-then-insert on `(user_id, shop_id, design_id)`
 * so we do not rely on `ON CONFLICT (design_id)` (requires a unique index many DBs
 * do not have yet). Callers must pass `design_id`, `user_id`, and `shop_id` when
 * replacing an existing logical design.
 */
export async function saveBadgeDesign(design: BadgeDesign) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const uid = design.user_id?.trim();
  const sid = design.shop_id?.trim();
  const did = design.design_id?.trim();
  if (uid && sid && did) {
    const { error: delErr } = await supabaseAdmin
      .from("badge_designs")
      .delete()
      .eq("user_id", uid)
      .eq("shop_id", sid)
      .eq("design_id", did);
    if (delErr) {
      console.error("saveBadgeDesign delete-by-design_id error:", delErr);
      throw delErr;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("badge_designs")
    .insert(design)
    .select()
    .single();

  if (error) {
    console.error("Save error:", error);
    throw error;
  }

  return data;
}

export async function getBadgeDesign(designId: string) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("design_id", designId)
    .single();

  if (error) {
    console.error("Get error:", error);
    throw error;
  }

  return data;
}

export async function getCustomerDesigns(customerId: string) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("user_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Get customer designs error:", error);
    throw error;
  }

  return data;
}

/** Latest milestone design for user/shop (excludes autosave). Used by legacy GET /api/saved-design. */
export async function getLatestSavedDesign(userId: string, shopId: string) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .or("save_kind.eq.manual,save_kind.eq.cart,save_kind.eq.ordered,save_kind.is.null")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestSavedDesign error:", error);
    throw error;
  }

  return data;
}

/** Delete existing saved designs for a user in a shop so only one set is kept (replace previous on save). */
export async function deleteSavedDesignsForUser(
  userId: string,
  shopId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { error } = await supabaseAdmin
    .from("badge_designs")
    .delete()
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("status", "saved");

  if (error) {
    console.error("deleteSavedDesignsForUser error:", error);
    throw error;
  }
}

/** Same row shape as {@link BadgeDesign}; stored in `sign_designs` for the sign designer. */
export type SignDesign = BadgeDesign;

const GAVEL_DESIGNS_OMIT_COLUMNS = [
  "background_color",
  "backing_price",
  "backing_type",
  "base_price",
] as const;

function rowForSignLikeInsert(
  table: SignLikeDesignsTable,
  design: SignDesign,
): SignDesign | Omit<
  SignDesign,
  "background_color" | "backing_price" | "backing_type" | "base_price"
> {
  if (table !== "gavel_designs") return design;
  const next = { ...design };
  for (const col of GAVEL_DESIGNS_OMIT_COLUMNS) {
    delete next[col];
  }
  return next;
}

/** Persistable logo URL for sign tables — skips empty and data URLs. */
export function persistedSignUploadedImageUrl(
  src: string | undefined | null,
): string | undefined {
  if (src == null || typeof src !== "string") return undefined;
  const t = src.trim();
  if (!t || t.startsWith("data:")) return undefined;
  return t;
}

/** Reads sign user logo URL from serialized badge JSON (`badge.logo.src`). */
export function uploadedImageUrlFromBadgeRecord(
  badge: Record<string, unknown> | undefined,
): string | undefined {
  const logo = badge?.logo as { src?: string } | undefined;
  return persistedSignUploadedImageUrl(logo?.src);
}

async function saveSignLikeDesign(
  table: SignLikeDesignsTable,
  design: SignDesign,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const uid = design.user_id?.trim();
  const sid = design.shop_id?.trim();
  const did = design.design_id?.trim();
  if (uid && sid && did) {
    const { error: delErr } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("user_id", uid)
      .eq("shop_id", sid)
      .eq("design_id", did);
    if (delErr) {
      console.error(`saveSignLikeDesign(${table}) delete-by-design_id error:`, delErr);
      throw delErr;
    }
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(rowForSignLikeInsert(table, design))
    .select()
    .single();

  if (error) {
    console.error(`Save ${table} error:`, error);
    throw error;
  }

  return data;
}

export async function saveSignDesign(design: SignDesign) {
  return saveSignLikeDesign("sign_designs", design);
}

export async function savePlaqueDesign(design: SignDesign) {
  return saveSignLikeDesign("plaque_designs", design);
}

export async function saveDeskSignDesign(design: SignDesign) {
  return saveSignLikeDesign("desk_sign_designs", design);
}

async function getLatestSavedSignLikeDesign(
  table: SignLikeDesignsTable,
  userId: string,
  shopId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .or("save_kind.eq.manual,save_kind.eq.cart,save_kind.eq.ordered,save_kind.is.null")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`getLatestSavedSignLikeDesign(${table}) error:`, error);
    throw error;
  }

  return data;
}

/** Latest milestone sign design for user/shop (excludes autosave). */
export async function getLatestSavedSignDesign(userId: string, shopId: string) {
  return getLatestSavedSignLikeDesign("sign_designs", userId, shopId);
}

export async function getLatestSavedPlaqueDesign(
  userId: string,
  shopId: string,
) {
  return getLatestSavedSignLikeDesign("plaque_designs", userId, shopId);
}

export async function getLatestSavedDeskSignDesign(
  userId: string,
  shopId: string,
) {
  return getLatestSavedSignLikeDesign("desk_sign_designs", userId, shopId);
}

export async function getLatestSavedGavelDesign(
  userId: string,
  shopId: string,
) {
  return getLatestSavedSignLikeDesign("gavel_designs", userId, shopId);
}

export async function getLatestSavedPenDesign(
  userId: string,
  shopId: string,
) {
  return getLatestSavedSignLikeDesign("pen_designs", userId, shopId);
}

async function deleteSavedSignLikeDesignsForUser(
  table: SignLikeDesignsTable,
  userId: string,
  shopId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("status", "saved");

  if (error) {
    console.error(`deleteSavedSignLikeDesignsForUser(${table}) error:`, error);
    throw error;
  }
}

export async function deleteSavedSignDesignsForUser(
  userId: string,
  shopId: string,
) {
  return deleteSavedSignLikeDesignsForUser("sign_designs", userId, shopId);
}

export async function deleteSavedPlaqueDesignsForUser(
  userId: string,
  shopId: string,
) {
  return deleteSavedSignLikeDesignsForUser("plaque_designs", userId, shopId);
}

export async function deleteSavedDeskSignDesignsForUser(
  userId: string,
  shopId: string,
) {
  return deleteSavedSignLikeDesignsForUser("desk_sign_designs", userId, shopId);
}

function countBadgesInDesignData(designData: unknown): number {
  if (!designData || typeof designData !== "object") return 0;
  const d = designData as Record<string, unknown>;
  const all = d.allBadges;
  if (Array.isArray(all)) return all.length;
  if (d.badge) return 1;
  return 0;
}

function milestoneStatusForKind(kind: DesignSaveKind): BadgeDesign["status"] {
  if (kind === "ordered") return "ordered";
  return "saved";
}

/** Keep at most `limit` milestone rows (manual/cart/ordered; legacy null save_kind counts). Autosave row excluded. */
export async function pruneDesignMilestones(
  table: "badge_designs" | SignLikeDesignsTable,
  userId: string,
  shopId: string,
  limit = DESIGN_LIBRARY_MILESTONE_LIMIT,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const autosaveId = stableAutosaveDesignId(userId, shopId);
  const { data: rows, error } = await supabaseAdmin
    .from(table)
    .select("design_id, created_at, save_kind")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .neq("design_id", autosaveId)
    .or("save_kind.eq.manual,save_kind.eq.cart,save_kind.eq.ordered,save_kind.is.null")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("pruneDesignMilestones select error:", error);
    throw error;
  }

  const milestones = (rows ?? []).filter((r) => r.save_kind !== "autosave");
  if (milestones.length <= limit) return;

  const toRemove = milestones.length - limit;
  const ids = milestones.slice(0, toRemove).map((r) => r.design_id);
  if (ids.length === 0) return;

  const { error: delErr } = await supabaseAdmin
    .from(table)
    .delete()
    .in("design_id", ids);

  if (delErr) {
    console.error("pruneDesignMilestones delete error:", delErr);
    throw delErr;
  }
}

/**
 * Remove prior autosave rows for this user+shop before inserting the canonical
 * autosave row. Postgres/Supabase upsert defaults to the table PK (`id`); if PK
 * is a UUID, each save inserted a new row even when `design_id` was stable.
 * Also clears legacy duplicates (e.g. wrong `save_kind`).
 */
async function deleteLibraryAutosaveDuplicatesBadge(
  userId: string,
  shopId: string,
  stableDesignId: string,
) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("badge_designs")
    .delete()
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .or(`save_kind.eq.autosave,design_id.eq.${stableDesignId}`);
  if (error) {
    console.error("deleteLibraryAutosaveDuplicatesBadge:", error);
    throw error;
  }
}

async function deleteLibraryAutosaveDuplicatesSignLike(
  table: SignLikeDesignsTable,
  userId: string,
  shopId: string,
  stableDesignId: string,
) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .or(`save_kind.eq.autosave,design_id.eq.${stableDesignId}`);
  if (error) {
    console.error(`deleteLibraryAutosaveDuplicatesSignLike(${table}):`, error);
    throw error;
  }
}

export async function upsertBadgeAutosaveDesign(row: BadgeDesign) {
  const uid = row.user_id?.trim();
  const sid = row.shop_id?.trim();
  if (!uid || !sid) {
    throw new Error("user_id and shop_id are required for autosave");
  }
  const stableId = stableAutosaveDesignId(uid, sid);
  await deleteLibraryAutosaveDuplicatesBadge(uid, sid, stableId);
  const full: BadgeDesign = {
    ...row,
    design_id: stableId,
    user_id: uid,
    shop_id: sid,
    save_kind: "autosave",
    status: "draft",
  };
  return saveBadgeDesign(full);
}

export async function upsertSignLikeAutosaveDesign(
  table: SignLikeDesignsTable,
  row: SignDesign,
) {
  const uid = row.user_id?.trim();
  const sid = row.shop_id?.trim();
  if (!uid || !sid) {
    throw new Error("user_id and shop_id are required for autosave");
  }
  const stableId = stableAutosaveDesignId(uid, sid);
  await deleteLibraryAutosaveDuplicatesSignLike(table, uid, sid, stableId);
  const full: SignDesign = {
    ...row,
    design_id: stableId,
    user_id: uid,
    shop_id: sid,
    save_kind: "autosave",
    status: "draft",
  };
  return saveSignLikeDesign(table, full);
}

export async function upsertSignAutosaveDesign(row: SignDesign) {
  return upsertSignLikeAutosaveDesign("sign_designs", row);
}

export async function upsertPlaqueAutosaveDesign(row: SignDesign) {
  return upsertSignLikeAutosaveDesign("plaque_designs", row);
}

export async function upsertDeskSignAutosaveDesign(row: SignDesign) {
  return upsertSignLikeAutosaveDesign("desk_sign_designs", row);
}

export async function upsertGavelAutosaveDesign(row: SignDesign) {
  return upsertSignLikeAutosaveDesign("gavel_designs", row);
}

export async function upsertPenAutosaveDesign(row: SignDesign) {
  return upsertSignLikeAutosaveDesign("pen_designs", row);
}

/** Insert or update a milestone row, then prune old milestones. */
export async function saveBadgeDesignMilestone(row: BadgeDesign, saveKind: DesignSaveKind) {
  if (saveKind === "autosave") {
    throw new Error("Use upsertBadgeAutosaveDesign for autosave");
  }
  const uid = row.user_id?.trim();
  const sid = row.shop_id?.trim();
  if (!uid || !sid) {
    throw new Error("user_id and shop_id are required");
  }
  const full: BadgeDesign = {
    ...row,
    user_id: uid,
    shop_id: sid,
    save_kind: saveKind,
    status: milestoneStatusForKind(saveKind),
  };
  const saved = await saveBadgeDesign(full);
  await pruneDesignMilestones("badge_designs", uid, sid);
  return saved;
}

export async function saveSignLikeDesignMilestone(
  table: SignLikeDesignsTable,
  row: SignDesign,
  saveKind: DesignSaveKind,
) {
  if (saveKind === "autosave") {
    throw new Error("Use upsertSignAutosaveDesign / upsertPlaqueAutosaveDesign for autosave");
  }
  const uid = row.user_id?.trim();
  const sid = row.shop_id?.trim();
  if (!uid || !sid) {
    throw new Error("user_id and shop_id are required");
  }
  const full: SignDesign = {
    ...row,
    user_id: uid,
    shop_id: sid,
    save_kind: saveKind,
    status: milestoneStatusForKind(saveKind),
  };
  const saved = await saveSignLikeDesign(table, full);
  await pruneDesignMilestones(table, uid, sid);
  return saved;
}

export async function saveSignDesignMilestone(row: SignDesign, saveKind: DesignSaveKind) {
  return saveSignLikeDesignMilestone("sign_designs", row, saveKind);
}

export async function savePlaqueDesignMilestone(
  row: SignDesign,
  saveKind: DesignSaveKind,
) {
  return saveSignLikeDesignMilestone("plaque_designs", row, saveKind);
}

export async function saveDeskSignDesignMilestone(
  row: SignDesign,
  saveKind: DesignSaveKind,
) {
  return saveSignLikeDesignMilestone("desk_sign_designs", row, saveKind);
}

export async function saveGavelDesignMilestone(
  row: SignDesign,
  saveKind: DesignSaveKind,
) {
  return saveSignLikeDesignMilestone("gavel_designs", row, saveKind);
}

export async function savePenDesignMilestone(
  row: SignDesign,
  saveKind: DesignSaveKind,
) {
  return saveSignLikeDesignMilestone("pen_designs", row, saveKind);
}

export type DesignGalleryListItem = {
  design_id: string;
  save_kind: DesignSaveKind | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  item_count: number;
};

/** Autosave first (if any), then up to 10 milestones by updated_at desc. */
export async function listBadgeDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data: autoRow, error: autoErr } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("save_kind", "autosave")
    .maybeSingle();

  if (autoErr) {
    console.error("listBadgeDesignGallery autosave error:", autoErr);
    throw autoErr;
  }

  const { data: mileRows, error: mileErr } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .neq("save_kind", "autosave")
    .or("save_kind.eq.manual,save_kind.eq.cart,save_kind.eq.ordered,save_kind.is.null")
    .order("updated_at", { ascending: false })
    .limit(DESIGN_LIBRARY_MILESTONE_LIMIT);

  if (mileErr) {
    console.error("listBadgeDesignGallery milestones error:", mileErr);
    throw mileErr;
  }

  const toItem = (r: BadgeDesign): DesignGalleryListItem => ({
    design_id: r.design_id,
    save_kind: (r.save_kind as DesignSaveKind | null) ?? null,
    thumbnail_url: r.thumbnail_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
    item_count: countBadgesInDesignData(r.design_data),
  });

  return {
    autosave: autoRow ? toItem(autoRow as BadgeDesign) : null,
    milestones: (mileRows ?? []).map((r) => toItem(r as BadgeDesign)),
  };
}

export async function listSignLikeDesignGallery(
  table: SignLikeDesignsTable,
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data: autoRow, error: autoErr } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("save_kind", "autosave")
    .maybeSingle();

  if (autoErr) {
    console.error(`listSignLikeDesignGallery(${table}) autosave error:`, autoErr);
    throw autoErr;
  }

  const { data: mileRows, error: mileErr } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .neq("save_kind", "autosave")
    .or("save_kind.eq.manual,save_kind.eq.cart,save_kind.eq.ordered,save_kind.is.null")
    .order("updated_at", { ascending: false })
    .limit(DESIGN_LIBRARY_MILESTONE_LIMIT);

  if (mileErr) {
    console.error(`listSignLikeDesignGallery(${table}) milestones error:`, mileErr);
    throw mileErr;
  }

  const toItem = (r: SignDesign): DesignGalleryListItem => ({
    design_id: r.design_id,
    save_kind: (r.save_kind as DesignSaveKind | null) ?? null,
    thumbnail_url: r.thumbnail_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
    item_count: countBadgesInDesignData(r.design_data),
  });

  return {
    autosave: autoRow ? toItem(autoRow as SignDesign) : null,
    milestones: (mileRows ?? []).map((r) => toItem(r as SignDesign)),
  };
}

export async function listSignDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  return listSignLikeDesignGallery("sign_designs", userId, shopId);
}

export async function listPlaqueDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  return listSignLikeDesignGallery("plaque_designs", userId, shopId);
}

export async function listDeskSignDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  return listSignLikeDesignGallery("desk_sign_designs", userId, shopId);
}

export async function listGavelDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  return listSignLikeDesignGallery("gavel_designs", userId, shopId);
}

export async function listPenDesignGallery(
  userId: string,
  shopId: string,
): Promise<{ autosave: DesignGalleryListItem | null; milestones: DesignGalleryListItem[] }> {
  return listSignLikeDesignGallery("pen_designs", userId, shopId);
}

/** Remove one milestone row (manual/cart/ordered). Cannot delete the autosave draft row. */
export async function deleteDesignLibraryMilestone(
  table: "badge_designs" | SignLikeDesignsTable,
  userId: string,
  shopId: string,
  designId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const uid = userId?.trim();
  const sid = shopId?.trim();
  const did = designId?.trim();
  if (!uid || !sid || !did) {
    throw new Error("userId, shopId, and designId are required");
  }
  const stableId = stableAutosaveDesignId(uid, sid);
  if (did === stableId) {
    throw new Error("Cannot delete the autosave draft row");
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq("user_id", uid)
    .eq("shop_id", sid)
    .eq("design_id", did)
    .select("design_id");

  if (error) {
    console.error("deleteDesignLibraryMilestone:", error);
    throw error;
  }
  if (!data?.length) {
    throw new Error(
      "That design was not found or may have already been removed.",
    );
  }
}

export async function getBadgeDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("badge_designs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("design_id", designId)
    .maybeSingle();

  if (error) {
    console.error("getBadgeDesignForUserShop error:", error);
    throw error;
  }

  return data as BadgeDesign | null;
}

export async function getSignLikeDesignForUserShop(
  table: SignLikeDesignsTable,
  userId: string,
  shopId: string,
  designId: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("design_id", designId)
    .maybeSingle();

  if (error) {
    console.error(`getSignLikeDesignForUserShop(${table}) error:`, error);
    throw error;
  }

  return data as SignDesign | null;
}

export async function getSignDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  return getSignLikeDesignForUserShop("sign_designs", userId, shopId, designId);
}

export async function getPlaqueDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  return getSignLikeDesignForUserShop("plaque_designs", userId, shopId, designId);
}

export async function getDeskSignDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  return getSignLikeDesignForUserShop(
    "desk_sign_designs",
    userId,
    shopId,
    designId,
  );
}

export async function getGavelDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  return getSignLikeDesignForUserShop("gavel_designs", userId, shopId, designId);
}

export async function getPenDesignForUserShop(
  userId: string,
  shopId: string,
  designId: string,
) {
  return getSignLikeDesignForUserShop("pen_designs", userId, shopId, designId);
}

/**
 * After order is paid: copy cart milestone row to a new ordered row (new design_id), then prune.
 */
export async function insertOrderedDesignSnapshotFromCart(params: {
  table: "badge_designs" | SignLikeDesignsTable;
  cartDesignId: string;
  shopifyOrderId: string;
}) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const orderSeg = params.shopifyOrderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const cartSeg = params.cartDesignId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  const newId = `ordered_${orderSeg}_${cartSeg}`.slice(0, 240);

  const { data: cartRow, error: findErr } = await supabaseAdmin
    .from(params.table)
    .select("*")
    .eq("design_id", params.cartDesignId)
    .eq("save_kind", "cart")
    .maybeSingle();

  if (findErr) {
    console.error("insertOrderedDesignSnapshotFromCart find error:", findErr);
    throw findErr;
  }

  if (!cartRow?.user_id || !cartRow?.shop_id || !cartRow.design_data) {
    return { skipped: true as const, reason: "no_cart_snapshot" as const };
  }

  const uid = cartRow.user_id;
  const sid = cartRow.shop_id;
  const c = cartRow as BadgeDesign;
  const dd = c.design_data as Record<string, unknown>;
  const allBadges = dd?.allBadges as unknown[] | undefined;
  const firstBadge = Array.isArray(allBadges)
    ? (allBadges[0] as Record<string, unknown> | undefined)
    : (dd?.badge as Record<string, unknown> | undefined);

  const row: BadgeDesign = {
    design_id: newId,
    product_id: c.product_id ?? "",
    shop_id: c.shop_id,
    user_id: c.user_id,
    ...(params.table === "gavel_designs" || params.table === "pen_designs"
      ? {}
      : {
          background_color:
            (firstBadge?.backgroundColor as string | undefined) ??
            c.background_color ??
            "#FFFFFF",
          backing_type:
            (firstBadge?.backing as string | undefined) ?? c.backing_type,
          backing_price: c.backing_price ?? 0,
          base_price: c.base_price ?? 9.99,
        }),
    total_price: c.total_price ?? 9.99,
    design_data: c.design_data,
    thumbnail_url: c.thumbnail_url,
    uploaded_image_url:
      (c as BadgeDesign).uploaded_image_url ??
      uploadedImageUrlFromBadgeRecord(firstBadge),
    save_kind: "ordered",
    status: "ordered",
  };

  if (params.table === "badge_designs") {
    await saveBadgeDesign(row);
    await pruneDesignMilestones("badge_designs", uid, sid);
  } else {
    await saveSignLikeDesign(params.table, row as SignDesign);
    await pruneDesignMilestones(params.table, uid, sid);
  }

  return { skipped: false as const, design_id: newId };
}

// Badge order items interface - matches actual table schema
export interface BadgeOrderItem {
  id?: string;
  shopify_order_id?: string; // TEXT - Shopify order ID
  shopify_order_number?: string; // TEXT - human-readable order number (e.g. #1001)
  design_id: string; // TEXT - links to main order design_id
  badge_id?: string; // TEXT - unique ID for this specific badge
  background_color?: string; // Format: "ColorName #hexcode" or "#hexcode" (badges)
  backing_type?: string; // pin | magnetic | adhesive (badges)
  /** Desk signs only: "Acrylic · Clear · 2×8\"" etc. */
  finish?: string;
  /** Desk signs only: none | desk | wall */
  attachment_method?: "none" | "desk" | "wall" | string;
  // Line 1 properties
  line_1_text?: string;
  line_1_font?: string;
  line_1_font_size?: number;
  line_1_bold?: boolean;
  line_1_underline?: boolean;
  line_1_italicize?: boolean;
  line_1_color?: string;
  line_1_alignment?: string;
  // Line 2 properties
  line_2_text?: string;
  line_2_font?: string;
  line_2_font_size?: number;
  line_2_bold?: boolean;
  line_2_underline?: boolean;
  line_2_italicize?: boolean;
  line_2_color?: string;
  line_2_alignment?: string;
  // Line 3 properties
  line_3_text?: string;
  line_3_font?: string;
  line_3_font_size?: number;
  line_3_bold?: boolean;
  line_3_underline?: boolean;
  line_3_italicize?: boolean;
  line_3_color?: string;
  line_3_alignment?: string;
  // Line 4 properties
  line_4_text?: string;
  line_4_font?: string;
  line_4_font_size?: number;
  line_4_bold?: boolean;
  line_4_underline?: boolean;
  line_4_italicize?: boolean;
  line_4_color?: string;
  line_4_alignment?: string;
  // Lines 5–6 (sign_order_items; optional elsewhere)
  line_5_text?: string;
  line_5_font?: string;
  line_5_font_size?: number;
  line_5_bold?: boolean;
  line_5_underline?: boolean;
  line_5_italicize?: boolean;
  line_5_color?: string;
  line_5_alignment?: string;
  line_6_text?: string;
  line_6_font?: string;
  line_6_font_size?: number;
  line_6_bold?: boolean;
  line_6_underline?: boolean;
  line_6_italicize?: boolean;
  line_6_color?: string;
  line_6_alignment?: string;
  thumbnail_url?: string;
  full_image_url?: string;
  /** CorelDRAW / print SVG: text + icon + registration shape only (no background art). */
  print_svg_url?: string;
  /**
   * Print SVG for a second engraved surface on the same line, when the product
   * has one: the stand plate on a gavel+stand, or the top of an engraved sound
   * block. `print_svg_url` stays the gavel band, so the pair is band + this.
   */
  secondary_svg_url?: string;
  /** Sign designer: user-uploaded logo URL (sign_order_items only). */
  uploaded_image_url?: string;
  pdf_url?: string;
  shopify_customer_id?: string;
  /** Number of units; 1 at add-to-cart, updated from order line at checkout. Used for badges, signs, stamps, etc. */
  quantity?: number;
  /**
   * Full designer state for this line (in-memory / badge tables).
   * Desk-sign rows persist this as `data_json` in Supabase.
   */
  badge_json?: unknown;
  /** Design-level designer state that is not per-badge; index-0 row only. */
  design_meta?: unknown;
  /**
   * True when created by Playwright / local QA (`?qaTest=1`).
   * Filter or `DELETE … WHERE is_qa_test = true` without touching real orders.
   */
  is_qa_test?: boolean;
  status?: "draft" | "in_cart" | "order_placed" | "fulfilled";
  created_at?: string;
  updated_at?: string;
}

// Helper function to get color name from hex code
// Checks all color arrays from colors.ts, returns "User Specified" if not found
function getColorName(hex: string | undefined): string {
  if (!hex) return "";

  // Normalize hex code (ensure it has # and is uppercase)
  const normalizedHex = hex.startsWith("#")
    ? hex.toUpperCase()
    : `#${hex.toUpperCase()}`;

  // Check all color arrays from colors.ts
  // Combine all color arrays into a single search
  const allColorArrays = [
    ...BACKGROUND_COLORS,
    ...EXTENDED_BACKGROUND_COLORS,
    ...SMART_PALETTE_COLORS,
    ...FONT_COLORS,
  ];

  // Find matching color
  const color = allColorArrays.find(
    (c) => c.value.toUpperCase() === normalizedHex,
  );

  if (color) {
    return color.name;
  }

  // If no match found, return "User Specified"
  return "User Specified";
}

// Helper function to format color as "ColorName #hexcode" or "User Specified #hexcode"
function formatColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;

  // Ensure hex has # prefix
  const hexWithHash = hex.startsWith("#") ? hex : `#${hex}`;
  const colorName = getColorName(hex);

  // Always include the name (either the actual name or "User Specified")
  return `${colorName} ${hexWithHash}`;
}

// Helper function to calculate fontSize from sizeNorm
// Uses templateId to determine designBox height (96px for 1x3, 144px for 1.5x3)
function calculateFontSize(
  line: { sizeNorm?: number; fontSize?: number },
  templateId?: string,
): number | undefined {
  // If fontSize is already set, use it
  if (line.fontSize !== undefined) {
    return Math.round(line.fontSize);
  }

  // Otherwise calculate from sizeNorm
  if (line.sizeNorm !== undefined) {
    // Determine designBox height from templateId
    // 1x3 badges are typically 96px tall, 1.5x3 badges are 144px tall
    let designBoxHeight = 96; // default for 1x3
    if (templateId && templateId.includes("1.5")) {
      designBoxHeight = 144;
    }

    const fontSize = line.sizeNorm * designBoxHeight;
    return Math.round(fontSize);
  }

  return undefined;
}

// Helper function to convert Badge object to BadgeOrderItem format
export function convertBadgeToOrderItem(
  badge: Badge,
  designId: string,
  badgeIndex: number,
  options?: {
    shopify_order_id?: string;
    shopify_order_number?: string;
    thumbnail_url?: string;
    full_image_url?: string;
    /** CorelDRAW / print SVG: text + icon + registration shape only (no background art). */
    print_svg_url?: string;
    /** Second engraved surface on the same line (stand plate / sound block top). */
    secondary_svg_url?: string;
    pdf_url?: string;
    shopify_customer_id?: string;
    /** Default 1; set from cart/order when known. */
    quantity?: number;
    /** Row/file prefix: badge-0 vs sign-0 (default badge). */
    lineIdPrefix?: string;
    /** Design-level state (sign type/size, plaque layout/size); index-0 row only. */
    design_meta?: unknown;
    /** Playwright / local QA marker (`?qaTest=1`). */
    is_qa_test?: boolean;
  },
): BadgeOrderItem {
  const lines = badge.lines || [];
  const prefix = options?.lineIdPrefix ?? "badge";
  const isDeskSign = Boolean(badge.deskSignMaterial) || prefix === "desk-sign";
  const isGavel = Boolean(badge.gavelStyle) || prefix === "gavel";
  const isPen = Boolean(badge.penStyle) || prefix === "pen";

  // Use badge-0, badge-1, ... so link-order (which uses line index from cart) can match
  return {
    design_id: designId,
    badge_id: `${prefix}-${badgeIndex}`,
    shopify_order_id: options?.shopify_order_id,
    shopify_order_number: options?.shopify_order_number,
    ...(isDeskSign
      ? {
          finish: formatDeskSignOrderFinish(badge),
          attachment_method: formatDeskSignAttachmentMethod(badge),
        }
      : isGavel
        ? {
            finish: formatGavelOrderFinish(
              badge.gavelStyle,
              badge.gavelBandFinish,
            ),
            attachment_method: "none",
          }
        : isPen
          ? {
              finish: "Blue gift set · case band + cap engraving",
              attachment_method: "none",
            }
      : {
          background_color: formatColor(badge.backgroundColor),
          backing_type: badge.backing ?? undefined,
        }),
    // Line 1 (index 0)
    line_1_text: lines[0]?.text,
    line_1_font: lines[0]?.fontFamily,
    line_1_font_size: calculateFontSize(lines[0] || {}, badge.templateId),
    line_1_bold: lines[0]?.bold ?? false,
    line_1_underline: lines[0]?.underline ?? false,
    line_1_italicize: lines[0]?.italic ?? false,
    line_1_color: formatColor(lines[0]?.color),
    line_1_alignment: lines[0]?.align,
    // Line 2 (index 1)
    line_2_text: lines[1]?.text,
    line_2_font: lines[1]?.fontFamily,
    line_2_font_size: calculateFontSize(lines[1] || {}, badge.templateId),
    line_2_bold: lines[1]?.bold ?? false,
    line_2_underline: lines[1]?.underline ?? false,
    line_2_italicize: lines[1]?.italic ?? false,
    line_2_color: formatColor(lines[1]?.color),
    line_2_alignment: lines[1]?.align,
    // Line 3 (index 2)
    line_3_text: lines[2]?.text,
    line_3_font: lines[2]?.fontFamily,
    line_3_font_size: calculateFontSize(lines[2] || {}, badge.templateId),
    line_3_bold: lines[2]?.bold ?? false,
    line_3_underline: lines[2]?.underline ?? false,
    line_3_italicize: lines[2]?.italic ?? false,
    line_3_color: formatColor(lines[2]?.color),
    line_3_alignment: lines[2]?.align,
    // Line 4 (index 3)
    line_4_text: lines[3]?.text,
    line_4_font: lines[3]?.fontFamily,
    line_4_font_size: calculateFontSize(lines[3] || {}, badge.templateId),
    line_4_bold: lines[3]?.bold ?? false,
    line_4_underline: lines[3]?.underline ?? false,
    line_4_italicize: lines[3]?.italic ?? false,
    line_4_color: formatColor(lines[3]?.color),
    line_4_alignment: lines[3]?.align,
    line_5_text: lines[4]?.text,
    line_5_font: lines[4]?.fontFamily,
    line_5_font_size: calculateFontSize(lines[4] || {}, badge.templateId),
    line_5_bold: lines[4]?.bold ?? false,
    line_5_underline: lines[4]?.underline ?? false,
    line_5_italicize: lines[4]?.italic ?? false,
    line_5_color: formatColor(lines[4]?.color),
    line_5_alignment: lines[4]?.align,
    line_6_text: lines[5]?.text,
    line_6_font: lines[5]?.fontFamily,
    line_6_font_size: calculateFontSize(lines[5] || {}, badge.templateId),
    line_6_bold: lines[5]?.bold ?? false,
    line_6_underline: lines[5]?.underline ?? false,
    line_6_italicize: lines[5]?.italic ?? false,
    line_6_color: formatColor(lines[5]?.color),
    line_6_alignment: lines[5]?.align,
    thumbnail_url: options?.thumbnail_url,
    full_image_url: options?.full_image_url,
    print_svg_url: options?.print_svg_url,
    secondary_svg_url: options?.secondary_svg_url,
    uploaded_image_url: persistedSignUploadedImageUrl(badge.logo?.src),
    pdf_url: options?.pdf_url,
    shopify_customer_id: options?.shopify_customer_id,
    quantity: options?.quantity ?? 1,
    badge_json: badge,
    ...(badgeIndex === 0 && options?.design_meta
      ? { design_meta: options.design_meta }
      : {}),
    ...(options?.is_qa_test ? { is_qa_test: true } : {}),
  };
}

// Save badge order item
export async function saveBadgeOrderItem(item: BadgeOrderItem) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("badge_order_items")
    .insert({
      design_id: item.design_id,
      badge_id: item.badge_id,
      shopify_order_id: item.shopify_order_id,
      shopify_order_number: item.shopify_order_number,
      background_color: item.background_color,
      backing_type: item.backing_type,
      line_1_text: item.line_1_text,
      line_1_font: item.line_1_font,
      line_1_font_size: item.line_1_font_size,
      line_1_bold: item.line_1_bold,
      line_1_underline: item.line_1_underline,
      line_1_italicize: item.line_1_italicize,
      line_1_color: item.line_1_color,
      line_1_alignment: item.line_1_alignment,
      line_2_text: item.line_2_text,
      line_2_font: item.line_2_font,
      line_2_font_size: item.line_2_font_size,
      line_2_bold: item.line_2_bold,
      line_2_underline: item.line_2_underline,
      line_2_italicize: item.line_2_italicize,
      line_2_color: item.line_2_color,
      line_2_alignment: item.line_2_alignment,
      line_3_text: item.line_3_text,
      line_3_font: item.line_3_font,
      line_3_font_size: item.line_3_font_size,
      line_3_bold: item.line_3_bold,
      line_3_underline: item.line_3_underline,
      line_3_italicize: item.line_3_italicize,
      line_3_color: item.line_3_color,
      line_3_alignment: item.line_3_alignment,
      line_4_text: item.line_4_text,
      line_4_font: item.line_4_font,
      line_4_font_size: item.line_4_font_size,
      line_4_bold: item.line_4_bold,
      line_4_underline: item.line_4_underline,
      line_4_italicize: item.line_4_italicize,
      line_4_color: item.line_4_color,
      line_4_alignment: item.line_4_alignment,
      thumbnail_url: item.thumbnail_url,
      full_image_url: item.full_image_url,
      print_svg_url: item.print_svg_url,
      pdf_url: item.pdf_url,
      shopify_customer_id: item.shopify_customer_id,
      status: item.status ?? "draft",
      ...(item.is_qa_test ? { is_qa_test: true } : {}),
      quantity: item.quantity ?? 1,
      created_at: item.created_at || getPacificTimestamp(),
      updated_at: getPacificTimestamp(),
    })
    .select()
    .single();

  if (error) {
    console.error("Save badge order item error:", error);
    throw error;
  }

  return data;
}

// Save multiple badge order items (one per badge)
export async function saveBadgeOrderItems(items: BadgeOrderItem[]) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  const itemsToInsert = items.map((item) => ({
    design_id: item.design_id,
    badge_id: item.badge_id,
    shopify_order_id: item.shopify_order_id,
    shopify_order_number: item.shopify_order_number,
    quantity: item.quantity ?? 1,
    background_color: item.background_color,
    backing_type: item.backing_type,
    line_1_text: item.line_1_text,
    line_1_font: item.line_1_font,
    line_1_font_size: item.line_1_font_size,
    line_1_bold: item.line_1_bold,
    line_1_underline: item.line_1_underline,
    line_1_italicize: item.line_1_italicize,
    line_1_color: item.line_1_color,
    line_1_alignment: item.line_1_alignment,
    line_2_text: item.line_2_text,
    line_2_font: item.line_2_font,
    line_2_font_size: item.line_2_font_size,
    line_2_bold: item.line_2_bold,
    line_2_underline: item.line_2_underline,
    line_2_italicize: item.line_2_italicize,
    line_2_color: item.line_2_color,
    line_2_alignment: item.line_2_alignment,
    line_3_text: item.line_3_text,
    line_3_font: item.line_3_font,
    line_3_font_size: item.line_3_font_size,
    line_3_bold: item.line_3_bold,
    line_3_underline: item.line_3_underline,
    line_3_italicize: item.line_3_italicize,
    line_3_color: item.line_3_color,
    line_3_alignment: item.line_3_alignment,
    line_4_text: item.line_4_text,
    line_4_font: item.line_4_font,
    line_4_font_size: item.line_4_font_size,
    line_4_bold: item.line_4_bold,
    line_4_underline: item.line_4_underline,
    line_4_italicize: item.line_4_italicize,
    line_4_color: item.line_4_color,
    line_4_alignment: item.line_4_alignment,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    print_svg_url: item.print_svg_url,
    pdf_url: item.pdf_url,
    shopify_customer_id: item.shopify_customer_id,
    status: item.status ?? "draft",
    ...(item.is_qa_test ? { is_qa_test: true } : {}),
    created_at: item.created_at || getPacificTimestamp(),
    updated_at: getPacificTimestamp(),
  }));

  const { data, error } = await supabaseAdmin
    .from("badge_order_items")
    .insert(itemsToInsert)
    .select();

  if (error) {
    console.error("Save badge order items error:", error);
    throw error;
  }

  return data;
}

/** Map BadgeOrderItem to row payload (shared by insert and upsert). */
function badgeOrderItemToRow(item: BadgeOrderItem) {
  return {
    design_id: item.design_id,
    badge_id: item.badge_id,
    shopify_order_id: item.shopify_order_id,
    shopify_order_number: item.shopify_order_number,
    quantity: item.quantity ?? 1,
    background_color: item.background_color,
    backing_type: item.backing_type,
    line_1_text: item.line_1_text,
    line_1_font: item.line_1_font,
    line_1_font_size: item.line_1_font_size,
    line_1_bold: item.line_1_bold,
    line_1_underline: item.line_1_underline,
    line_1_italicize: item.line_1_italicize,
    line_1_color: item.line_1_color,
    line_1_alignment: item.line_1_alignment,
    line_2_text: item.line_2_text,
    line_2_font: item.line_2_font,
    line_2_font_size: item.line_2_font_size,
    line_2_bold: item.line_2_bold,
    line_2_underline: item.line_2_underline,
    line_2_italicize: item.line_2_italicize,
    line_2_color: item.line_2_color,
    line_2_alignment: item.line_2_alignment,
    line_3_text: item.line_3_text,
    line_3_font: item.line_3_font,
    line_3_font_size: item.line_3_font_size,
    line_3_bold: item.line_3_bold,
    line_3_underline: item.line_3_underline,
    line_3_italicize: item.line_3_italicize,
    line_3_color: item.line_3_color,
    line_3_alignment: item.line_3_alignment,
    line_4_text: item.line_4_text,
    line_4_font: item.line_4_font,
    line_4_font_size: item.line_4_font_size,
    line_4_bold: item.line_4_bold,
    line_4_underline: item.line_4_underline,
    line_4_italicize: item.line_4_italicize,
    line_4_color: item.line_4_color,
    line_4_alignment: item.line_4_alignment,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    print_svg_url: item.print_svg_url,
    pdf_url: item.pdf_url,
    shopify_customer_id: item.shopify_customer_id,
    status: item.status ?? "draft",
    ...(item.is_qa_test ? { is_qa_test: true } : {}),
    updated_at: getPacificTimestamp(),
  };
}

/** Upsert badge order items by (design_id, badge_id). Used for incremental draft saves. */
export async function upsertBadgeOrderItems(items: BadgeOrderItem[]) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  if (!items.length) return [];
  const rows = items.map((item) => ({
    ...badgeOrderItemToRow(item),
    created_at: item.created_at || getPacificTimestamp(),
  }));
  const { data, error } = await supabaseAdmin
    .from("badge_order_items")
    .upsert(rows, { onConflict: "design_id,badge_id", ignoreDuplicates: false })
    .select();
  if (error) {
    console.error("upsertBadgeOrderItems error:", error);
    throw error;
  }
  return data ?? [];
}

/** Update draft rows for design_id with pdf_url (and optionally backing_type) and return rows (for thumbnailUrls). Returns empty if no rows updated. */
export async function updateDraftPdfUrlAndReturnRows(
  designId: string,
  pdfUrl: string,
  options?: { backingType?: string },
): Promise<{
  thumbnailUrls: string[];
  fullImageUrls: string[];
  updatedCount: number;
}> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const updatePayload: Record<string, unknown> = {
    pdf_url: pdfUrl,
    updated_at: getPacificTimestamp(),
  };
  if (options?.backingType != null && options.backingType !== "") {
    updatePayload.backing_type = options.backingType;
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("badge_order_items")
    .update(updatePayload)
    .eq("design_id", designId)
    .eq("status", "draft")
    .select("badge_id, thumbnail_url, full_image_url");
  if (updateError) {
    console.error("updateDraftPdfUrlAndReturnRows error:", updateError);
    throw updateError;
  }
  const rows = (updated ?? []) as Array<{
    badge_id: string | null;
    thumbnail_url: string | null;
    full_image_url: string | null;
  }>;
  rows.sort((a, b) => {
    const aIdx = a.badge_id
      ? parseInt(a.badge_id.replace("badge-", ""), 10)
      : 0;
    const bIdx = b.badge_id
      ? parseInt(b.badge_id.replace("badge-", ""), 10)
      : 0;
    return aIdx - bIdx;
  });
  const thumbnailUrls = rows.map((r) => r.thumbnail_url ?? "");
  const fullImageUrls = rows.map((r) => r.full_image_url ?? "");
  return { thumbnailUrls, fullImageUrls, updatedCount: rows.length };
}

/** Update pdf_url for all badge_order_items with the given design_id (any status). Used after order-slip PDF regeneration. */
export async function updatePdfUrlByDesignId(
  designId: string,
  pdfUrl: string,
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { error } = await supabaseAdmin
    .from("badge_order_items")
    .update({ pdf_url: pdfUrl, updated_at: getPacificTimestamp() })
    .eq("design_id", designId);
  if (error) {
    console.error("updatePdfUrlByDesignId error:", error);
    throw error;
  }
}

/** Set status for all badge_order_items with the given design_id (e.g. 'in_cart' when user adds to cart). */
export async function updateBadgeOrderItemsStatusByDesignId(
  designId: string,
  status: string,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { error } = await supabaseAdmin
    .from("badge_order_items")
    .update({ status, updated_at: getPacificTimestamp() })
    .eq("design_id", designId);
  if (error) {
    console.error("updateBadgeOrderItemsStatusByDesignId error:", error);
    throw error;
  }
}

/** Delete all badge_order_items for the given design_id (any status). Use before replace-insert in send-to-supabase fallback. */
export async function deleteBadgeOrderItemsByDesignId(designId: string) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { error } = await supabaseAdmin
    .from("badge_order_items")
    .delete()
    .eq("design_id", designId);
  if (error) {
    console.error("deleteBadgeOrderItemsByDesignId error:", error);
    throw error;
  }
}

/** Delete draft rows for design_id whose badge_id is not in keepBadgeIds. */
export async function deleteDraftBadgeOrderItemsExcept(
  designId: string,
  keepBadgeIds: string[],
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { data: rows } = await supabaseAdmin
    .from("badge_order_items")
    .select("id, badge_id")
    .eq("design_id", designId)
    .eq("status", "draft");
  if (!rows?.length) return;
  const toDelete = rows
    .filter(
      (r: { badge_id: string | null }) =>
        r.badge_id && !keepBadgeIds.includes(r.badge_id),
    )
    .map((r: { id: string }) => r.id);
  if (!toDelete.length) return;
  const { error } = await supabaseAdmin
    .from("badge_order_items")
    .delete()
    .in("id", toDelete);
  if (error) {
    console.error("deleteDraftBadgeOrderItemsExcept error:", error);
    throw error;
  }
}

// Update badge_order_items with shopify_order_id and shopify_order_number by design_id (for link-order flow from Gadget)
export async function updateBadgeOrderItemsByDesignIds(
  designIds: string[],
  shopifyOrderId: string,
  shopifyOrderNumber?: string | null,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  if (!designIds.length) {
    return { data: [], error: null };
  }
  const payload: Record<string, unknown> = {
    shopify_order_id: shopifyOrderId,
    updated_at: getPacificTimestamp(),
  };
  if (shopifyOrderNumber != null && shopifyOrderNumber !== "") {
    payload.shopify_order_number = shopifyOrderNumber;
  }
  const { data, error } = await supabaseAdmin
    .from("badge_order_items")
    .update(payload)
    .in("design_id", designIds)
    .select();
  if (error) {
    console.error("Update badge order items by design_ids error:", error);
    throw error;
  }
  return { data, error: null };
}

/** Get all badge_order_items for a design_id (for order-slip PDF generation). */
export async function getBadgeOrderItemsByDesignId(
  designId: string,
): Promise<BadgeOrderItem[]> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { data, error } = await supabaseAdmin
    .from("badge_order_items")
    .select("*")
    .eq("design_id", designId)
    .order("badge_id", { ascending: true });
  if (error) {
    console.error("getBadgeOrderItemsByDesignId error:", error);
    throw error;
  }
  return (data ?? []) as BadgeOrderItem[];
}

/** Update draft badge_order_items with order info by design_id + badge_id (single-table flow). Sets quantity from order line (for checkout quantity changes). */
export async function updateDraftBadgeOrderItemsWithOrderInfo(params: {
  lineItems: Array<{ designId: string; badgeIndex: number; quantity?: number }>;
  shopifyOrderId: string;
  shopifyOrderNumber?: string | null;
  shopifyCustomerId?: string | null;
}) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }
  const { lineItems, shopifyOrderId, shopifyOrderNumber, shopifyCustomerId } =
    params;
  if (!lineItems.length) return { data: [], error: null };

  const basePayload: Record<string, unknown> = {
    shopify_order_id: shopifyOrderId,
    status: "order_placed",
    updated_at: getPacificTimestamp(),
  };
  if (shopifyOrderNumber != null && shopifyOrderNumber !== "")
    basePayload.shopify_order_number = shopifyOrderNumber;
  if (shopifyCustomerId != null && shopifyCustomerId !== "")
    basePayload.shopify_customer_id = shopifyCustomerId;

  const results: unknown[] = [];
  for (const { designId, badgeIndex, quantity } of lineItems) {
    const badgeId = `badge-${badgeIndex}`;
    const payload = { ...basePayload, quantity: quantity != null && quantity >= 1 ? quantity : 1 };
    const { data, error } = await supabaseAdmin
      .from("badge_order_items")
      .update(payload)
      .eq("design_id", designId)
      .eq("badge_id", badgeId)
      .in("status", ["draft", "in_cart"])
      .select()
      .maybeSingle();
    if (error) {
      console.error("updateDraftBadgeOrderItemsWithOrderInfo error:", error);
      throw error;
    }
    if (data) results.push(data);
  }
  return { data: results, error: null };
}
