import type { GadgetSettings } from "gadget-server";

export const settings: GadgetSettings = {
  type: "gadget/settings/v1",
  frameworkVersion: "v1.5.0",
  plugins: {
    connections: {
      shopify: {
        apiVersion: "2026-01",
        enabledModels: ["shopifyOrder", "shopifyOrderLineItem"],
        type: "partner",
        scopes: [
          "read_orders",
          "read_order_edits",
          "read_products",
          "read_customers",
          "read_fulfillments",
        ],
      },
    },
  },
};
