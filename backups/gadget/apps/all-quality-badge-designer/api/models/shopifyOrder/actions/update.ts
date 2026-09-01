import {
  applyParams,
  save,
  ActionOptions,
  ActionRun,
} from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

export const run: ActionRun = async ({
  params,
  record,
  logger,
}) => {
  // Standard Gadget update flow
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};


export const options: ActionOptions = {
  actionType: "update",
};
