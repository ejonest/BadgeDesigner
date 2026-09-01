import type { LoaderFunctionArgs } from "@remix-run/node";
import { latestPenDesignRequest } from "~/lib/designers/penDesignLibrary";

export async function loader({ request }: LoaderFunctionArgs) {
  return latestPenDesignRequest(request);
}
