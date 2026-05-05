import type { ActionFunction } from "@remix-run/node";
import { runSaveToGadget } from "~/lib/designers/httpHandlers";

export const action: ActionFunction = async ({ request }) => {
  return runSaveToGadget("plaque", request);
};
