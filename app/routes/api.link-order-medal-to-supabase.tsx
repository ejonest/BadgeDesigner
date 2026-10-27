import { json, type ActionFunctionArgs } from "@remix-run/node";
import { runLinkPaidOrderToSupabase } from "~/lib/designers/httpHandlers";

export async function action({ request }: ActionFunctionArgs) {
  return runLinkPaidOrderToSupabase("medal", request);
}

export async function loader() {
  return json({ error: "Method not allowed" }, { status: 405 });
}
