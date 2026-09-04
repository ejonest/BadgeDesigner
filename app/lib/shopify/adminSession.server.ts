import { createHmac, timingSafeEqual } from "node:crypto";

type AdminAppConfig = {
  clientId: string;
  clientSecret: string;
};

type SessionTokenClaims = {
  aud?: string | string[];
  dest?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
};

export type VerifiedAdminSession = {
  shop: string;
  staffUserId?: string;
};

function decodeJsonPart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

/**
 * Accepts *.myshopify.com, a store handle, an admin.shopify.com/store/… URL,
 * or a full https shop URL. Invalid keys are skipped.
 */
function normalizeShopDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.hostname.endsWith(".myshopify.com")) return url.hostname;
    if (url.hostname === "admin.shopify.com") {
      const handle = url.pathname.match(/^\/store\/([a-z0-9-]+)/)?.[1];
      if (handle) return `${handle}.myshopify.com`;
    }
  } catch {
    // Bare handles fall through.
  }

  if (/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return `${value}.myshopify.com`;
  }
  return null;
}

function shopFromClaim(value: unknown): string | null {
  return typeof value === "string" ? normalizeShopDomain(value) : null;
}

function parseAppsJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let parsed: unknown = JSON.parse(text);
  if (typeof parsed === "string") parsed = JSON.parse(parsed);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SHOPIFY_ADMIN_APPS_JSON must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function configuredApps(): {
  byShop: Record<string, AdminAppConfig>;
  byClientId: Record<string, AdminAppConfig>;
  rawKeys: string[];
} {
  const raw = process.env.SHOPIFY_ADMIN_APPS_JSON;
  if (!raw) {
    throw new Error("SHOPIFY_ADMIN_APPS_JSON is not configured.");
  }

  const parsed = parseAppsJson(raw);
  const byShop: Record<string, AdminAppConfig> = {};
  const byClientId: Record<string, AdminAppConfig> = {};
  const rawKeys = Object.keys(parsed);

  for (const [rawShop, value] of Object.entries(parsed)) {
    const config =
      value != null && typeof value === "object" && !Array.isArray(value)
        ? (value as Partial<AdminAppConfig>)
        : {};
    const shop = normalizeShopDomain(rawShop);
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();
    if (!shop || !clientId || !clientSecret) continue;
    const app = { clientId, clientSecret };
    byShop[shop] = app;
    byClientId[clientId] = app;
  }

  return { byShop, byClientId, rawKeys };
}

function deny(code: string, detail?: Record<string, unknown>): never {
  console.warn(
    `[production-admin] session token rejected: ${code}`,
    detail ?? {},
  );
  throw new Response(`Unauthorized (${code})`, { status: 401 });
}

function audienceValues(audience: unknown): string[] {
  if (typeof audience === "string" && audience) return [audience];
  if (Array.isArray(audience)) {
    return audience.filter((value): value is string => typeof value === "string");
  }
  return [];
}

function hmacValid(secret: string, signingInput: string, signature: Buffer) {
  const expected = createHmac("sha256", secret)
    .update(signingInput, "utf8")
    .digest();
  return (
    expected.length === signature.length &&
    timingSafeEqual(expected, signature)
  );
}

export function verifyAdminSessionToken(
  request: Request,
): VerifiedAdminSession {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    deny("missing-bearer-token");
  }

  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    deny("malformed-token");
  }

  let header: Record<string, unknown>;
  let claims: SessionTokenClaims;
  try {
    header = decodeJsonPart(parts[0]);
    claims = decodeJsonPart(parts[1]) as SessionTokenClaims;
  } catch {
    deny("undecodable-token");
  }

  const shop = shopFromClaim(claims.dest) ?? shopFromClaim(claims.iss);
  const audiences = audienceValues(claims.aud);
  console.info("[production-admin] session token claims", {
    alg: header.alg,
    dest: claims.dest,
    iss: claims.iss,
    aud: claims.aud,
    shop,
    origin: request.headers.get("Origin"),
  });

  let apps: ReturnType<typeof configuredApps>;
  try {
    apps = configuredApps();
  } catch (error) {
    console.error("[production-admin] invalid app configuration", error);
    throw new Response("Server configuration error", { status: 500 });
  }

  if (Object.keys(apps.byClientId).length === 0) {
    console.error("[production-admin] no usable apps in SHOPIFY_ADMIN_APPS_JSON", {
      rawKeys: apps.rawKeys,
    });
    throw new Response("Server configuration error", { status: 500 });
  }

  const candidates: AdminAppConfig[] = [];
  const seen = new Set<string>();
  for (const audience of audiences) {
    const app = apps.byClientId[audience];
    if (app && !seen.has(app.clientId)) {
      candidates.push(app);
      seen.add(app.clientId);
    }
  }
  if (shop && apps.byShop[shop] && !seen.has(apps.byShop[shop].clientId)) {
    candidates.push(apps.byShop[shop]);
    seen.add(apps.byShop[shop].clientId);
  }
  // Last resort: try every configured secret. Prevents a dest/handle mismatch
  // from rejecting a token that is otherwise valid for one of our apps.
  for (const app of Object.values(apps.byClientId)) {
    if (!seen.has(app.clientId)) {
      candidates.push(app);
      seen.add(app.clientId);
    }
  }

  if (header.alg != null && header.alg !== "HS256") {
    deny("unexpected-algorithm", {
      alg: header.alg,
      dest: claims.dest,
      iss: claims.iss,
      aud: claims.aud,
    });
  }

  let provided: Buffer;
  try {
    provided = Buffer.from(parts[2], "base64url");
  } catch {
    deny("undecodable-signature");
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const app = candidates.find((candidate) =>
    hmacValid(candidate.clientSecret, signingInput, provided),
  );
  if (!app) {
    deny("bad-signature", {
      shop,
      dest: claims.dest,
      iss: claims.iss,
      tokenAudience: claims.aud,
      configuredClientIds: Object.keys(apps.byClientId),
      configuredShops: Object.keys(apps.byShop),
      rawKeys: apps.rawKeys,
    });
  }

  if (audiences.length > 0 && !audiences.includes(app.clientId)) {
    deny("client-id-mismatch", {
      shop,
      tokenAudience: claims.aud,
      matchedClientId: app.clientId,
    });
  }

  const resolvedShop =
    shop ??
    Object.entries(apps.byShop).find(([, value]) => value.clientId === app.clientId)?.[0];
  if (!resolvedShop) {
    deny("no-shop-in-token", { dest: claims.dest, iss: claims.iss });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now - 10) {
    deny("expired-token", { shop: resolvedShop, exp: claims.exp, now });
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + 10) {
    deny("token-not-yet-valid", { shop: resolvedShop, nbf: claims.nbf, now });
  }

  return {
    shop: resolvedShop,
    ...(typeof claims.sub === "string" ? { staffUserId: claims.sub } : {}),
  };
}
