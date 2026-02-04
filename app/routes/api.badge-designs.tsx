import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from "@gadget-client/allqualitybadges";

function getGadgetEnvironment(): "development" | "production" {
  const url = process.env.GADGET_API_URL || "https://all-quality-badge-designer--development.gadget.app";
  if (url.includes("--production")) return "production";
  return "development";
}

const api = new Client({
  environment: getGadgetEnvironment(),
  authenticationMode: { apiKey: process.env.GADGET_API_KEY },
});

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { designData, shopId, productId } = body;

    if (!shopId) {
      return json({ error: "shopId is required" }, { status: 400 });
    }

    const gadgetPayload = {
      shopId,
      productId,
      designId: `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "saved" as const,
      designData: designData.badge || designData,
      backgroundColor: designData.badge?.backgroundColor || "#FFFFFF",
      backingType: designData.badge?.backing || "pin",
      basePrice: 9.99,
      backingPrice: 0,
      totalPrice: 9.99,
      textLines: designData.badge?.lines || [],
    };

    // Call Gadget GraphQL with PascalCase "BadgeDesign" argument (API expects BadgeDesign, not badgeDesign)
    const GADGET_API_URL = process.env.GADGET_API_URL || "https://all-quality-badge-designer--development.gadget.app";
    const GADGET_API_KEY = process.env.GADGET_API_KEY;
    const graphqlUrl = `${GADGET_API_URL.replace(/\/$/, "")}/api/graphql`;
    const createMutation = `
      mutation CreateBadgeDesign($BadgeDesign: CreateBadgeDesignInput!) {
        createBadgeDesign(BadgeDesign: $BadgeDesign) {
          success
          errors { message code }
          badgeDesign { id designId shopId status }
        }
      }
    `;
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GADGET_API_KEY}`,
      },
      body: JSON.stringify({ query: createMutation, variables: { BadgeDesign: gadgetPayload } }),
    });
    const data = await res.json();
    if (data.errors?.length) {
      throw new Error(data.errors.map((e: { message: string }) => e.message).join("; "));
    }
    const createResult = data.data?.createBadgeDesign;
    if (!createResult?.success || !createResult?.badgeDesign) {
      throw new Error(createResult?.errors?.[0]?.message || "Create failed");
    }
    const result = createResult.badgeDesign;

    return json({
      success: true,
      id: result.id,
      designId: result.designId,
      badgeDesign: result,
      message: "Design saved successfully"
    });
  } catch (error) {
    return json({
      error: "Failed to save design",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const designId = url.searchParams.get("id");

  if (!designId) {
    return json({ error: "Design ID required" }, { status: 400 });
  }

  try {
    // Fetch the badge design using the Gadget client
    const result = await api.badgeDesign.findOne(designId);
    return json({
      success: true,
      design: result
    });
  } catch (error) {
    return json({ error: "Failed to load design" }, { status: 500 });
  }
}; 