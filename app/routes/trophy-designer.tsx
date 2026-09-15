import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import TrophyDesigner from "~/components/TrophyDesigner";

export const meta: MetaFunction = () => [
  { title: "Trophy Designer" },
  {
    name: "description",
    content: "Personalize a trophy and preview its custom plate.",
  },
];

export const loader: LoaderFunction = async () => {
  const headers = new Headers();
  headers.set("X-Frame-Options", "ALLOWALL");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return json({}, { headers });
};

export default function TrophyDesignerRoute() {
  return (
    <div className="min-h-screen h-full bg-[#f7f4ef]">
      <TrophyDesigner />
    </div>
  );
}
