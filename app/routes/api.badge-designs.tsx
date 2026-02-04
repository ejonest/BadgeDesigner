import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from "@gadget-client/allqualitybadges";

const api = new Client({
  environment: process.env.GADGET_API_URL || "https://all-quality-badge-designer.gadget.app",
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

    // Prepare the payload for Gadget
    const gadgetPayload = {
      shopId,
      productId,
      designId: `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "saved" as const, // Use the correct enum value
      designData: designData.badge || designData,
      backgroundColor: designData.badge?.backgroundColor || "#FFFFFF",
      backingType: designData.badge?.backing || "pin",
      basePrice: 9.99,
      backingPrice: 0,
      totalPrice: 9.99,
      textLines: designData.badge?.lines || [],
    };

    // Create the badge design using the Gadget client
    const result = await api.badgeDesign.create(gadgetPayload);

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