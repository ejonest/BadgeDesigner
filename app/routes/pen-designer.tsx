import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import PenDesigner from "~/components/PenDesigner";
import { getDesignerConfig, resolveGadgetUrl } from "~/config/designers";

export const meta: MetaFunction = () => [
  { title: "Custom Pen Designer — All Quality Badges" },
  {
    name: "description",
    content: "Personalize a presentation case band and engrave a pen cap.",
  },
];

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const definition = getDesignerConfig("pen");
  const rawPrice = Number(url.searchParams.get("price"));
  const headers = new Headers({
    "X-Frame-Options": "ALLOWALL",
    "Content-Security-Policy": "frame-ancestors *",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  return json(
    {
      productId: url.searchParams.get("product"),
      shop: url.searchParams.get("shop"),
      customerId:
        url.searchParams.get("customerId") ??
        url.searchParams.get("customer_id"),
      variantId:
        url.searchParams.get("variantId") ??
        url.searchParams.get("variant_id") ??
        url.searchParams.get("variant"),
      unitPrice: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null,
      gadgetApiUrl: resolveGadgetUrl(definition),
      gadgetApiKey: undefined,
    },
    { headers },
  );
};

export default function PenDesignerRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <PenDesigner
      productId={data.productId}
      shop={data.shop}
      customerId={data.customerId}
      variantId={data.variantId}
      unitPrice={data.unitPrice}
      gadgetApiUrl={data.gadgetApiUrl}
      gadgetApiKey={data.gadgetApiKey}
    />
  );
}
