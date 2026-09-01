import type { LoaderFunctionArgs } from "@remix-run/node";
import { penDesignDetailRequest } from "~/lib/designers/penDesignLibrary";

export async function loader({ request }: LoaderFunctionArgs) {
  return penDesignDetailRequest(request);
}
