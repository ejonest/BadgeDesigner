import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import GavelDesigner from "~/components/GavelDesigner";
import { getDesignerConfig, resolveGadgetUrl } from "~/config/designers";

export const meta: MetaFunction = () => {
  return [
    { title: "Gavel Designer — Gavels Fast" },
    { name: "description", content: "Design your custom gavel band" },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product");
  const shop = url.searchParams.get("shop");
  const customerId =
    url.searchParams.get("customerId") ?? url.searchParams.get("customer_id");

  const headers = new Headers();
  headers.set("X-Frame-Options", "ALLOWALL");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  const gavelCfg = getDesignerConfig("gavel");
  return json(
    {
      productId,
      shop,
      customerId: customerId ?? null,
      timestamp: Date.now(),
      GADGET_API_URL: resolveGadgetUrl(gavelCfg),
      GADGET_API_KEY: undefined,
    },
    { headers },
  );
};

export default function GavelDesignerRoute() {
  const { productId, shop, customerId, GADGET_API_URL, GADGET_API_KEY } =
    useLoaderData<typeof loader>();

  return (
    <div className="gf-designer-page min-h-screen h-full bg-[#f7f4ef]">
      <GavelDesigner
        productId={productId}
        shop={shop}
        customerId={customerId}
        gadgetApiUrl={GADGET_API_URL}
        gadgetApiKey={GADGET_API_KEY}
      />
    </div>
  );
}
