import { type ActionFunctionArgs } from "@remix-run/node";
import { runSendOrderDraftToSupabase } from "~/lib/designers/httpHandlers";

export async function action({ request }: ActionFunctionArgs) {
  return runSendOrderDraftToSupabase("sign", request);
}
