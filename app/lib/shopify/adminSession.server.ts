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

function configuredApps(): Record<string, AdminAppConfig> {
  const raw = process.env.SHOPIFY_ADMIN_APPS_JSON;
  if (!raw) {
    throw new Error("SHOPIFY_ADMIN_APPS_JSON is not configured.");
  }

  const parsed = JSON.parse(raw) as Record<string, Partial<AdminAppConfig>>;
  const apps: Record<string, AdminAppConfig> = {};
  for (const [rawShop, config] of Object.entries(parsed)) {
    const shop = rawShop.trim().toLowerCase();
    if (
      !shop.endsWith(".myshopify.com") ||
      !config.clientId?.trim() ||
      !config.clientSecret?.trim()
    ) {
      continue;
    }
    apps[shop] = {
      clientId: config.clientId.trim(),
      clientSecret: config.clientSecret.trim(),
    };
  }
  return apps;
}

function shopFromDestination(destination: unknown): string | null {
  if (typeof destination !== "string") return null;
  try {
    const shop = new URL(destination).hostname.toLowerCase();
    return shop.endsWith(".myshopify.com") ? shop : null;
  } catch {
    return null;
  }
}

function hostnameFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function audienceMatches(audience: unknown, clientId: string): boolean {
  if (typeof audience === "string") return audience === clientId;
  return Array.isArray(audience) && audience.includes(clientId);
}

export function verifyAdminSessionToken(request: Request): VerifiedAdminSession {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Response("Unauthorized", { status: 401 });
  }

  let header: Record<string, unknown>;
  let claims: SessionTokenClaims;
  try {
    header = decodeJsonPart(parts[0]);
    claims = decodeJsonPart(parts[1]) as SessionTokenClaims;
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (header.alg !== "HS256") {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = shopFromDestination(claims.dest);
  const issuerHost = hostnameFromUrl(claims.iss);
  let apps: Record<string, AdminAppConfig>;
  try {
    apps = configuredApps();
  } catch (error) {
    console.error("[production-admin] invalid app configuration", error);
    throw new Response("Server configuration error", { status: 500 });
  }
  const app = shop ? apps[shop] : undefined;
  if (
    !shop ||
    issuerHost !== shop ||
    !app ||
    !audienceMatches(claims.aud, app.clientId)
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const expected = createHmac("sha256", app.clientSecret)
    .update(`${parts[0]}.${parts[1]}`, "utf8")
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(parts[2], "base64url");
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof claims.exp !== "number" ||
    claims.exp < now - 5 ||
    (typeof claims.nbf === "number" && claims.nbf > now + 5)
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    shop,
    ...(typeof claims.sub === "string" ? { staffUserId: claims.sub } : {}),
  };
}
