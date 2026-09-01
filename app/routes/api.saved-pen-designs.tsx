import type { LoaderFunctionArgs } from "@remix-run/node";
import { listPenDesignsRequest } from "~/lib/designers/penDesignLibrary";

export async function loader({ request }: LoaderFunctionArgs) {
  return listPenDesignsRequest(request);
}
