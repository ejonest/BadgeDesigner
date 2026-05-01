/**
 * Allowlisted designer definitions: table/bucket names and Gadget wiring.
 * Never take table or bucket names from client input—only from this registry.
 */

export const DESIGNER_IDS = [
  "badge",
  "sign",
  "plaque",
  "stamp",
  "nameplate",
] as const;
export type DesignerId = (typeof DESIGNER_IDS)[number];

export type LineIdColumn = "badge_id" | "sign_id" | "plaque_id";

/** Supabase design-library tables (milestones + autosave). */
export type DesignLibraryTable =
  | "badge_designs"
  | "sign_designs"
  | "plaque_designs";

/** Sign and plaque share extended order-item rows and library shape. */
export type SignLikeDesignsTable = "sign_designs" | "plaque_designs";

export interface DesignerGadgetGraphQL {
  /** Env var for API base URL */
  apiUrlEnv: string;
  /** Env var for Bearer API key */
  apiKeyEnv: string;
  /** Default URL if env unset (dev fallback) */
  defaultApiUrl: string;
  /** GraphQL mutation name, e.g. createBadgeDesign */
  createField: string;
  /** Variables key and input type, e.g. BadgeDesign + CreateBadgeDesignInput */
  inputVariable: string;
  inputType: string;
  /** Response path: createBadgeDesign -> BadgeDesign */
  resultSelection: string;
}

export interface DesignerDefinition {
  id: DesignerId;
  label: string;
  orderItemsTable: string;
  imageBucket: string;
  pdfBucket: string;
  /** File / row prefix: badge-0, sign-0 */
  lineIdPrefix: string;
  /** DB column for line identity */
  lineIdColumn: LineIdColumn;
  /** Supabase upsert onConflict */
  upsertOnConflict: string;
  /** Primary cart line item property for line index (theme + Gadget should align) */
  cartIndexPropertyPrimary: string;
  cartIndexPropertyFallbacks: string[];
  gadget: DesignerGadgetGraphQL;
  /** Env var for link-order Bearer secret; implementation may fall back to LINK_ORDER_SECRET */
  linkOrderSecretEnv: string;
  pdfProofRelativePath: (designId: string) => string;
  orderSlipPdfRelativePath: (designId: string) => string;
}

const BADGE_DEFAULT_URL =
  "https://all-quality-badge-designer--development.gadget.app";

export const DESIGNERS: Record<DesignerId, DesignerDefinition> = {
  badge: {
    id: "badge",
    label: "Badge",
    orderItemsTable: "badge_order_items",
    imageBucket: "badge-images",
    pdfBucket: "badge-pdfs",
    lineIdPrefix: "badge",
    lineIdColumn: "badge_id",
    upsertOnConflict: "design_id,badge_id",
    cartIndexPropertyPrimary: "Badge Index",
    cartIndexPropertyFallbacks: ["Sign Index", "Plaque Index"],
    gadget: {
      apiUrlEnv: "GADGET_API_URL",
      apiKeyEnv: "GADGET_API_KEY",
      defaultApiUrl: BADGE_DEFAULT_URL,
      createField: "createBadgeDesign",
      inputVariable: "BadgeDesign",
      inputType: "CreateBadgeDesignInput",
      resultSelection: "BadgeDesign",
    },
    linkOrderSecretEnv: "LINK_ORDER_SECRET",
    pdfProofRelativePath: (designId) =>
      `${designId}/badge-design_proof.pdf`,
    orderSlipPdfRelativePath: (designId) =>
      `${designId}/badge-design.pdf`,
  },
  sign: {
    id: "sign",
    label: "Sign",
    orderItemsTable: "sign_order_items",
    imageBucket: "sign-images",
    pdfBucket: "sign-pdfs",
    lineIdPrefix: "sign",
    lineIdColumn: "sign_id",
    upsertOnConflict: "design_id,sign_id",
    cartIndexPropertyPrimary: "Sign Index",
    cartIndexPropertyFallbacks: ["Badge Index", "Plaque Index"],
    gadget: {
      apiUrlEnv: "GADGET_SIGN_API_URL",
      apiKeyEnv: "GADGET_SIGN_API_KEY",
      defaultApiUrl:
        "https://signs-by-lita-connection--development.gadget.app",
      createField: "createSignDesign",
      inputVariable: "SignDesign",
      inputType: "CreateSignDesignInput",
      resultSelection: "SignDesign",
    },
    linkOrderSecretEnv: "LINK_ORDER_SECRET_SIGN",
    pdfProofRelativePath: (designId) =>
      `${designId}/sign-design_proof.pdf`,
    orderSlipPdfRelativePath: (designId) =>
      `${designId}/sign-design.pdf`,
  },
  plaque: {
    id: "plaque",
    label: "Plaque",
    orderItemsTable: "plaque_order_items",
    imageBucket: "plaque-images",
    pdfBucket: "plaque-pdfs",
    lineIdPrefix: "plaque",
    lineIdColumn: "plaque_id",
    upsertOnConflict: "design_id,plaque_id",
    cartIndexPropertyPrimary: "Plaque Index",
    cartIndexPropertyFallbacks: ["Sign Index", "Badge Index"],
    gadget: {
      apiUrlEnv: "GADGET_PLAQUE_API_URL",
      apiKeyEnv: "GADGET_PLAQUE_API_KEY",
      defaultApiUrl:
        "https://signs-by-lita-connection--development.gadget.app",
      createField: "createPlaqueDesign",
      inputVariable: "PlaqueDesign",
      inputType: "CreatePlaqueDesignInput",
      resultSelection: "PlaqueDesign",
    },
    linkOrderSecretEnv: "LINK_ORDER_SECRET_PLAQUE",
    pdfProofRelativePath: (designId) =>
      `${designId}/plaque-design_proof.pdf`,
    orderSlipPdfRelativePath: (designId) =>
      `${designId}/plaque-design.pdf`,
  },
  stamp: {
    id: "stamp",
    label: "Stamp",
    orderItemsTable: "stamp_order_items",
    imageBucket: "stamp-images",
    pdfBucket: "stamp-pdfs",
    lineIdPrefix: "stamp",
    lineIdColumn: "badge_id",
    upsertOnConflict: "design_id,badge_id",
    cartIndexPropertyPrimary: "Stamp Index",
    cartIndexPropertyFallbacks: ["Badge Index"],
    gadget: {
      apiUrlEnv: "GADGET_STAMP_API_URL",
      apiKeyEnv: "GADGET_STAMP_API_KEY",
      defaultApiUrl: BADGE_DEFAULT_URL,
      createField: "createStampDesign",
      inputVariable: "StampDesign",
      inputType: "CreateStampDesignInput",
      resultSelection: "StampDesign",
    },
    linkOrderSecretEnv: "LINK_ORDER_SECRET_STAMP",
    pdfProofRelativePath: (designId) =>
      `${designId}/stamp-design_proof.pdf`,
    orderSlipPdfRelativePath: (designId) =>
      `${designId}/stamp-design.pdf`,
  },
  nameplate: {
    id: "nameplate",
    label: "Name plate",
    orderItemsTable: "nameplate_order_items",
    imageBucket: "nameplate-images",
    pdfBucket: "nameplate-pdfs",
    lineIdPrefix: "nameplate",
    lineIdColumn: "badge_id",
    upsertOnConflict: "design_id,badge_id",
    cartIndexPropertyPrimary: "Nameplate Index",
    cartIndexPropertyFallbacks: ["Badge Index"],
    gadget: {
      apiUrlEnv: "GADGET_NAMEPLATE_API_URL",
      apiKeyEnv: "GADGET_NAMEPLATE_API_KEY",
      defaultApiUrl: BADGE_DEFAULT_URL,
      createField: "createNameplateDesign",
      inputVariable: "NameplateDesign",
      inputType: "CreateNameplateDesignInput",
      resultSelection: "NameplateDesign",
    },
    linkOrderSecretEnv: "LINK_ORDER_SECRET_NAMEPLATE",
    pdfProofRelativePath: (designId) =>
      `${designId}/nameplate-design_proof.pdf`,
    orderSlipPdfRelativePath: (designId) =>
      `${designId}/nameplate-design.pdf`,
  },
};

export function isDesignerId(value: string): value is DesignerId {
  return (DESIGNER_IDS as readonly string[]).includes(value);
}

export function getDesignerConfig(id: string): DesignerDefinition {
  if (!isDesignerId(id)) {
    throw new Error(`Invalid designer id: ${id}`);
  }
  return DESIGNERS[id];
}

export function getDesignLibraryTable(
  id: DesignerId,
): DesignLibraryTable | null {
  if (id === "badge") return "badge_designs";
  if (id === "sign") return "sign_designs";
  if (id === "plaque") return "plaque_designs";
  return null;
}

export function getSignLikeLibraryTable(
  id: DesignerId,
): SignLikeDesignsTable | null {
  if (id === "sign") return "sign_designs";
  if (id === "plaque") return "plaque_designs";
  return null;
}

/** Design library + logo upload API routes (badge vs sign-like designers). */
export function getDesignerLibraryApiPaths(id: DesignerId): {
  saveDesign: string;
  autosaveDesign: string;
  savedDesign: string;
  savedDesigns: string;
  savedDesignDetail: string;
  deleteMilestone: string;
  uploadLogo: string;
} {
  if (id === "badge") {
    return {
      saveDesign: "/api/save-design",
      autosaveDesign: "/api/autosave-design",
      savedDesign: "/api/saved-design",
      savedDesigns: "/api/saved-designs",
      savedDesignDetail: "/api/saved-design-detail",
      deleteMilestone: "/api/delete-badge-design-milestone",
      uploadLogo: "",
    };
  }
  if (id === "sign") {
    return {
      saveDesign: "/api/save-sign-design",
      autosaveDesign: "/api/autosave-sign-design",
      savedDesign: "/api/saved-sign-design",
      savedDesigns: "/api/saved-sign-designs",
      savedDesignDetail: "/api/saved-sign-design-detail",
      deleteMilestone: "/api/delete-sign-design-milestone",
      uploadLogo: "/api/upload-sign-logo",
    };
  }
  if (id === "plaque") {
    return {
      saveDesign: "/api/save-plaque-design",
      autosaveDesign: "/api/autosave-plaque-design",
      savedDesign: "/api/saved-plaque-design",
      savedDesigns: "/api/saved-plaque-designs",
      savedDesignDetail: "/api/saved-plaque-design-detail",
      deleteMilestone: "/api/delete-plaque-design-milestone",
      uploadLogo: "/api/upload-plaque-logo",
    };
  }
  return {
    saveDesign: "/api/save-design",
    autosaveDesign: "/api/autosave-design",
    savedDesign: "/api/saved-design",
    savedDesigns: "/api/saved-designs",
    savedDesignDetail: "/api/saved-design-detail",
    deleteMilestone: "/api/delete-badge-design-milestone",
    uploadLogo: "",
  };
}

/** API paths for Remix routes (flat resource routes). */
export function getDesignerApiPaths(id: DesignerId): {
  save: string;
  sendToSupabase: string;
  linkOrderToSupabase: string;
  saveDraft: string;
} {
  if (id === "badge") {
    return {
      save: "/api/save-badge",
      sendToSupabase: "/api/send-to-supabase",
      linkOrderToSupabase: "/api/link-order-to-supabase",
      saveDraft: "/api/save-draft-badges",
    };
  }
  return {
    save: `/api/save-${id}`,
    sendToSupabase: `/api/send-${id}-to-supabase`,
    linkOrderToSupabase: `/api/link-order-${id}-to-supabase`,
    saveDraft: `/api/save-draft-${id}`,
  };
}

export function resolveGadgetUrl(def: DesignerDefinition): string {
  const fromEnv = process.env[def.gadget.apiUrlEnv];
  return (
    (typeof fromEnv === "string" && fromEnv.trim() !== ""
      ? fromEnv.trim()
      : null) ?? def.gadget.defaultApiUrl
  );
}

export function resolveGadgetApiKey(def: DesignerDefinition): string | undefined {
  const v = process.env[def.gadget.apiKeyEnv];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function resolveLinkOrderSecret(def: DesignerDefinition): string | undefined {
  const primary = process.env[def.linkOrderSecretEnv];
  if (typeof primary === "string" && primary.trim() !== "") {
    return primary.trim();
  }
  const fallback = process.env.LINK_ORDER_SECRET;
  if (typeof fallback === "string" && fallback.trim() !== "") {
    return fallback.trim();
  }
  return undefined;
}
