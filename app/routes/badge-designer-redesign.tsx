import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import BadgeDesignerRedesign from "~/components/BadgeDesignerRedesign";
import type { DesignerVariant } from "~/constants/designerVariants";
import {
  getDesignerConfig,
  resolveGadgetApiKey,
  resolveGadgetUrl,
} from "~/config/designers";

/**
 * Sandbox route for badge (and sign/plaque via same query params as `/`) redesign work.
 * Production storefronts keep embedding `/`; this URL is for staging, theme experiments, and local dev.
 *
 * Example: `/badge-designer-redesign?embedded=1&shop=…&product=…` (embedded=1 hides duplicate store chrome)
 * Local dev with placeholder nav: add `showStoreChrome=1`
 */
export const meta: MetaFunction = () => {
  return [
    { title: "Badge Designer (Redesign sandbox)" },
    {
      name: "description",
      content: "Experimental badge designer — not used in production iframe by default",
    },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
  console.log(
    "[BadgeDesignerRedesign] route loader (iframe page load)",
    new Date().toISOString(),
    request.url,
  );
  const url = new URL(request.url);
  const productId = url.searchParams.get("product");
  const shop = url.searchParams.get("shop");
  const customerId =
    url.searchParams.get("customerId") ?? url.searchParams.get("customer_id");

  const variantParam =
    url.searchParams.get("variant") ?? url.searchParams.get("designer");
  const isSign =
    variantParam === "sign" ||
    variantParam === "signs" ||
    url.searchParams.get("sign") === "1";
  const isPlaque =
    variantParam === "plaque" ||
    variantParam === "plaques" ||
    url.searchParams.get("plaque") === "1";

  const designerVariant: DesignerVariant = isPlaque
    ? "plaque"
    : isSign
      ? "sign"
      : "badge";
  const designerDef = getDesignerConfig(designerVariant);

  const headers = new Headers();
  headers.set("X-Frame-Options", "ALLOWALL");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return json(
    {
      productId,
      shop,
      customerId: customerId ?? null,
      timestamp: Date.now(),
      designerVariant,
      GADGET_API_URL: resolveGadgetUrl(designerDef),
      GADGET_API_KEY: resolveGadgetApiKey(designerDef),
    },
    { headers },
  );
};

export default function BadgeDesignerRedesignRoute() {
  const {
    productId,
    shop,
    customerId,
    designerVariant,
    GADGET_API_URL,
    GADGET_API_KEY,
  } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <BadgeDesignerRedesign
        variant={designerVariant}
        productId={productId}
        shop={shop}
        customerId={customerId}
        gadgetApiUrl={GADGET_API_URL}
        gadgetApiKey={GADGET_API_KEY}
      />
    </div>
  );
}
