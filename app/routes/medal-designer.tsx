import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import MedalDesigner from "~/components/MedalDesigner";

export const meta: MetaFunction = () => [
  { title: "Medal Designer" },
  {
    name: "description",
    content: "Personalize a medal and preview its custom circular insert.",
  },
];

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const headers = new Headers();
  headers.set("X-Frame-Options", "ALLOWALL");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return json(
    { embedded: url.searchParams.get("embedded") === "1" },
    { headers },
  );
};

export default function MedalDesignerRoute() {
  const { embedded } = useLoaderData<typeof loader>();
  return (
    <div
      className={`gf-designer-page min-h-screen h-full bg-[#f7f4ef]${
        embedded ? " gf-embedded" : ""
      }`}
    >
      <MedalDesigner />
    </div>
  );
}
