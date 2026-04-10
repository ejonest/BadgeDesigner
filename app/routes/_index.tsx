import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import BadgeDesigner from "~/components/BadgeDesigner";
import {
  getDesignerConfig,
  resolveGadgetApiKey,
  resolveGadgetUrl,
} from "~/config/designers";

export const meta: MetaFunction = () => {
  return [
    { title: "Badge Designer" },
    { name: "description", content: "Design your custom badges" },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
  console.log(
    "[BadgeDesigner] index loader (iframe page load)",
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

  const designerDef = getDesignerConfig(isSign ? "sign" : "badge");

  // Add headers for iframe embedding
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
      designerVariant: isSign ? ("sign" as const) : ("badge" as const),
      GADGET_API_URL: resolveGadgetUrl(designerDef),
      GADGET_API_KEY: resolveGadgetApiKey(designerDef),
    },
    { headers },
  );
};

export default function Index() {
  const {
    productId,
    shop,
    customerId,
    designerVariant,
    GADGET_API_URL,
    GADGET_API_KEY,
  } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <BadgeDesigner
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
