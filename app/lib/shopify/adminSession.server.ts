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

/**
 * Client IDs and shops are known from the three production-card app configs.
 * Only the Client secret belongs in env — that is the value Shopify uses to
 * HMAC-sign Admin extension ID tokens.
 */
const KNOWN_APPS: {
  shop?: string;
  clientId: string;
  secretEnv: string;
}[] = [
  {
    shop: "gavelsfast.myshopify.com",
    clientId: "6490c879339bec4fcf421185e16f92a3",
    secretEnv: "SHOPIFY_ADMIN_GF_CLIENT_SECRET",
  },
  {
    clientId: "fdbcb6c13f4baca70b9864a6f453b14a",
    secretEnv: "SHOPIFY_ADMIN_AQB_CLIENT_SECRET",
  },
  {
    clientId: "79a000d03b9a87721634cd232a8a8a8d",
    secretEnv: "SHOPIFY_ADMIN_SBL_CLIENT_SECRET",
  },
];

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

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function looksLikeClientSecret(value: string): boolean {
  return value.startsWith("shpss_") || /^[0-9a-f]{32}$/i.test(value);
}

function looksLikeClientId(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value) && !value.startsWith("shpss_");
}

/**
 * Recover from the field-swap we have already seen: shpss_… put in clientId
 * and the 32-char client ID (or a placeholder) put in clientSecret.
 */
function coerceAppConfig(raw: Partial<AdminAppConfig> & Record<string, unknown>): {
  clientId?: string;
  clientSecret?: string;
} {
  let clientId = asNonEmptyString(raw.clientId) ?? asNonEmptyString(raw.client_id);
  let clientSecret =
    asNonEmptyString(raw.clientSecret) ?? asNonEmptyString(raw.client_secret);

  if (
    clientId &&
    clientSecret &&
    looksLikeClientSecret(clientId) &&
    looksLikeClientId(clientSecret)
  ) {
    return { clientId: clientSecret, clientSecret: clientId };
  }
  if (clientId && looksLikeClientSecret(clientId) && !looksLikeClientSecret(clientSecret ?? "")) {
    return { clientId: undefined, clientSecret: clientId };
  }
  return { clientId, clientSecret };
}

function collectKnownEnvApps(): AdminAppConfig[] {
  const apps: AdminAppConfig[] = [];
  for (const known of KNOWN_APPS) {
    const clientSecret = process.env[known.secretEnv]?.trim();
    if (!clientSecret) continue;
    apps.push({ clientId: known.clientId, clientSecret });
  }
  return apps;
}

function collectJsonApps(): {
  apps: AdminAppConfig[];
  rawKeys: string[];
} {
  const raw = process.env.SHOPIFY_ADMIN_APPS_JSON;
  if (!raw) return { apps: [], rawKeys: [] };

  const parsed = parseAppsJson(raw);
  const apps: AdminAppConfig[] = [];
  for (const [rawShop, value] of Object.entries(parsed)) {
    const config =
      value != null && typeof value === "object" && !Array.isArray(value)
        ? coerceAppConfig(value as Partial<AdminAppConfig> & Record<string, unknown>)
        : {};
    const shop = normalizeShopDomain(rawShop);
    const known = KNOWN_APPS.find(
      (app) => app.shop === shop || app.clientId === config.clientId,
    );
    const clientId = config.clientId ?? known?.clientId;
    const clientSecret = config.clientSecret;
    if (!clientId || !clientSecret) continue;
    apps.push({ clientId, clientSecret });
  }
  return { apps, rawKeys: Object.keys(parsed) };
}

function configuredApps(): {
  byShop: Record<string, AdminAppConfig>;
  byClientId: Record<string, AdminAppConfig>;
  secrets: string[];
  rawKeys: string[];
  secretEnvsPresent: string[];
} {
  const json = collectJsonApps();
  const merged = [...collectKnownEnvApps(), ...json.apps];
  const byShop: Record<string, AdminAppConfig> = {};
  const byClientId: Record<string, AdminAppConfig> = {};
  const secrets: string[] = [];
  const seenSecrets = new Set<string>();

  for (const app of merged) {
    byClientId[app.clientId] = app;
    const knownShop = KNOWN_APPS.find((known) => known.clientId === app.clientId)?.shop;
    if (knownShop) byShop[knownShop] = app;
    if (!seenSecrets.has(app.clientSecret)) {
      seenSecrets.add(app.clientSecret);
      secrets.push(app.clientSecret);
    }
  }

  return {
    byShop,
    byClientId,
    secrets,
    rawKeys: json.rawKeys,
    secretEnvsPresent: KNOWN_APPS.filter((app) => Boolean(process.env[app.secretEnv]?.trim())).map(
      (app) => app.secretEnv,
    ),
  };
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

function secretKind(secret: string, clientId: string): string {
  if (secret.startsWith("shpat_")) return "admin-access-token";
  if (secret.startsWith("shpca_")) return "custom-app-token";
  if (clientId.startsWith("shpss_")) return "client-id-and-secret-swapped";
  if (secret === clientId) return "secret-equals-client-id";
  if (secret === `shpss_${clientId}`) return "secret-is-client-id-with-prefix";
  if (
    /^(gf_secret|aqb_secret|sbl_secret|paste_[a-z0-9_]+|your-?secret|\.\.\.|xxx+)$/i.test(
      secret,
    )
  ) {
    return "placeholder-secret";
  }
  if (secret.startsWith("shpss_") && secret.length === 38) return "shpss-client-secret";
  if (/^[0-9a-f]{32}$/i.test(secret)) return "legacy-hex-secret";
  return "unrecognized-secret";
}

/**
 * Shopify's official verifier (jose + getHMACKey) treats the secret as raw
 * char codes. Also try the unprefixed hex form used by older secrets.
 */
function hmacKeysForSecret(secret: string): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();
  const add = (key: Buffer) => {
    const stamp = key.toString("hex");
    if (seen.has(stamp)) return;
    seen.add(stamp);
    keys.push(key);
  };

  const raw = Buffer.alloc(secret.length);
  for (let i = 0; i < secret.length; i++) raw[i] = secret.charCodeAt(i);
  add(raw);
  add(Buffer.from(secret, "utf8"));

  if (secret.startsWith("shpss_")) {
    const rest = secret.slice(6);
    add(Buffer.from(rest, "utf8"));
    if (/^[0-9a-f]+$/i.test(rest) && rest.length % 2 === 0) {
      add(Buffer.from(rest, "hex"));
    }
  } else if (/^[0-9a-f]+$/i.test(secret) && secret.length % 2 === 0) {
    add(Buffer.from(secret, "hex"));
  }

  return keys;
}

function decodeSignature(part: string): Buffer {
  const url = Buffer.from(part, "base64url");
  if (url.length === 32) return url;
  const std = Buffer.from(part, "base64");
  return std.length === 32 ? std : url;
}

function hmacValid(secret: string, signingInput: string, signature: Buffer) {
  return hmacKeysForSecret(secret).some((key) => {
    const expected = createHmac("sha256", key)
      .update(signingInput, "utf8")
      .digest();
    return (
      expected.length === signature.length &&
      timingSafeEqual(expected, signature)
    );
  });
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
    typ: header.typ,
    kid: header.kid,
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

  if (apps.secrets.length === 0) {
    console.error("[production-admin] no client secrets configured", {
      rawKeys: apps.rawKeys,
      secretEnvsPresent: apps.secretEnvsPresent,
      hint: "Set SHOPIFY_ADMIN_GF_CLIENT_SECRET to the Client secret from Production Design Card – GF (starts with shpss_).",
    });
    throw new Response("Server configuration error", { status: 500 });
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
    provided = decodeSignature(parts[2]);
  } catch {
    deny("undecodable-signature");
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const matchedSecret = apps.secrets.find((secret) =>
    hmacValid(secret, signingInput, provided),
  );
  if (!matchedSecret) {
    const intended =
      (audiences[0] ? apps.byClientId[audiences[0]] : undefined) ??
      (shop ? apps.byShop[shop] : undefined) ??
      Object.values(apps.byClientId)[0];
    const kind = intended
      ? secretKind(intended.clientSecret, intended.clientId)
      : "missing-secret";
    deny(kind === "shpss-client-secret" || kind === "legacy-hex-secret" ? "bad-signature" : kind, {
      shop,
      dest: claims.dest,
      iss: claims.iss,
      tokenAudience: claims.aud,
      intendedSecretLength: intended?.clientSecret.length ?? 0,
      intendedSecretPrefix: intended?.clientSecret.slice(0, 6) ?? "",
      intendedSecretKind: kind,
      configuredClientIds: Object.keys(apps.byClientId),
      configuredShops: Object.keys(apps.byShop),
      secretEnvsPresent: apps.secretEnvsPresent,
      rawKeys: apps.rawKeys,
      hint: "Paste the current Client secret from Dev Dashboard → Production Design Card – GF into SHOPIFY_ADMIN_GF_CLIENT_SECRET. It must start with shpss_ and is not the Client ID.",
    });
  }

  const app =
    (audiences[0] ? apps.byClientId[audiences[0]] : undefined) ??
    (shop ? apps.byShop[shop] : undefined) ??
    Object.values(apps.byClientId).find((value) => value.clientSecret === matchedSecret);

  if (audiences.length > 0 && app && !audiences.includes(app.clientId)) {
    deny("client-id-mismatch", {
      shop,
      tokenAudience: claims.aud,
      matchedClientId: app.clientId,
    });
  }

  const resolvedShop =
    shop ??
    (app
      ? Object.entries(apps.byShop).find(([, value]) => value.clientId === app.clientId)?.[0]
      : undefined) ??
    KNOWN_APPS.find((known) => known.clientId === audiences[0])?.shop;
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
