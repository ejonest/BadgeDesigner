import {
  json,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { runLinkPaidOrderToSupabase } from "~/lib/designers/httpHandlers";

export async function loader() {
  return json(
    {
      error: "Method not allowed",
      message: "Use POST to link a pen order to Supabase",
    },
    { status: 405 },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  return runLinkPaidOrderToSupabase("pen", request);
}
