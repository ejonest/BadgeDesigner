function envTruthy(v: string | undefined): boolean {
  if (v == null || v === "") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export type DesignLibraryDummyAuth =
  | {
      enabled: true;
      userId: string;
      shopId: string;
      shopDomain: string;
    }
  | { enabled: false };

/**
 * Local-only fake Shopify customer + shop for testing design library APIs (autosave, gallery, milestones).
 *
 * Safety: only active in Vite **development** (`import.meta.env.DEV` or `MODE === 'development'`).
 * Production builds never enable this.
 *
 * Turn on with either:
 * - Env (must use `VITE_` prefix so the browser bundle can read it):
 *   `VITE_DESIGN_LIBRARY_DUMMY_MODE=true`
 * - URL query (no .env needed): `?designLibraryDummy=1` or `?dummyLibrary=1`
 *   Works on any designer route (e.g. `/sign-designer`, `/plaque-designer`).
 *
 * Optional env:
 * - VITE_DESIGN_LIBRARY_DUMMY_USER_ID=…
 * - VITE_DESIGN_LIBRARY_DUMMY_SHOP_ID=…
 */
export function getDesignLibraryDummyAuth(
  urlSearchParams?: URLSearchParams | null,
): DesignLibraryDummyAuth {
  const meta = import.meta.env as Record<string, string | boolean | undefined>;
  const isDev = Boolean(meta.DEV || meta.MODE === "development");
  if (!isDev) {
    return { enabled: false };
  }
  const fromEnv = envTruthy(
    meta.VITE_DESIGN_LIBRARY_DUMMY_MODE as string | undefined,
  );
  const fromQuery =
    urlSearchParams != null &&
    (urlSearchParams.get("designLibraryDummy") === "1" ||
      urlSearchParams.get("dummyLibrary") === "1");
  if (!fromEnv && !fromQuery) {
    return { enabled: false };
  }
  const userId =
    String(meta.VITE_DESIGN_LIBRARY_DUMMY_USER_ID ?? "").trim() ||
    "local-test-customer";
  const shopId =
    String(meta.VITE_DESIGN_LIBRARY_DUMMY_SHOP_ID ?? "").trim() ||
    "test-shop.myshopify.com";
  return {
    enabled: true,
    userId,
    shopId,
    shopDomain: shopId,
  };
}
