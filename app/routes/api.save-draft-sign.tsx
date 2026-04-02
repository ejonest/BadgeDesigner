import { json, type ActionFunctionArgs } from "@remix-run/node";
import { runSaveDraftDesigner } from "~/lib/designers/httpHandlers";

export async function action({ request }: ActionFunctionArgs) {
  return runSaveDraftDesigner("sign", request);
}

export async function loader() {
  return json({ error: "Method not allowed" }, { status: 405 });
}
