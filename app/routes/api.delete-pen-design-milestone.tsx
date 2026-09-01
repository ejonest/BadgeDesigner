import type { ActionFunctionArgs } from "@remix-run/node";
import { deletePenDesignRequest } from "~/lib/designers/penDesignLibrary";

export async function action({ request }: ActionFunctionArgs) {
  return deletePenDesignRequest(request);
}
