import { json, type ActionFunctionArgs } from "@remix-run/node";
import { runSendOrderDraftToSupabase } from "~/lib/designers/httpHandlers";

export async function action({ request }: ActionFunctionArgs) {
  return runSendOrderDraftToSupabase("medal", request);
}

export async function loader() {
  return json({ error: "Method not allowed" }, { status: 405 });
}
