import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "BadgeDesign" model, go to https://all-quality-badge-designer.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "oqDLYF433bC1",
  fields: {
    backgroundColor: { type: "string", storageKey: "mGZL5MTc6ggr" },
    backingPrice: { type: "string", storageKey: "Cq9cr2bifGWN" },
    backingType: { type: "string", storageKey: "Cp5DJtf88xdm" },
    basePrice: { type: "string", storageKey: "ce4ntfRxEle2" },
    designData: { type: "json", storageKey: "JDx5fwIFyLjs" },
    designId: { type: "string", storageKey: "K_xtz3HRVthS" },
    productId: { type: "string", storageKey: "oGM84XeGXD46" },
    shopId: { type: "string", storageKey: "cqC-NNJzNYs0" },
    status: { type: "string", storageKey: "Zq-dM-r5XCYl" },
    textLines: { type: "json", storageKey: "za_En_w0jSUQ" },
    totalPrice: { type: "string", storageKey: "Cg5FPY7l8Wyn" },
  },
};
