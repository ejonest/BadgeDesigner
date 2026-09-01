import type { ActionFunctionArgs } from "@remix-run/node";
import { savePenDesignRequest } from "~/lib/designers/penDesignLibrary";

export async function action({ request }: ActionFunctionArgs) {
  return savePenDesignRequest(request, true);
}
