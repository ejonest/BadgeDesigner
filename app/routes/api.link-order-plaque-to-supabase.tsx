import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { runLinkPaidOrderToSupabase } from "~/lib/designers/httpHandlers";

export async function loader({ request }: LoaderFunctionArgs) {
  return json(
    {
      error: "Method not allowed",
      message: "Use POST to link plaque order to Supabase",
    },
    { status: 405 },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  return runLinkPaidOrderToSupabase("plaque", request);
}
