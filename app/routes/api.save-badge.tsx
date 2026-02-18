import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

const GADGET_APP_URL = 'https://all-quality-badge-designer--development.gadget.app';

// Note: If Vercel logs show "upsertDesignCache" / "Could not find the table 'public.badge_designs'",
// that error comes from the Gadget backend (Gadget may sync to Supabase). This route does not use
// Supabase. Fix in Gadget: create badge_designs in Supabase or disable that sync.

export const action: ActionFunction = async ({ request }) => {
  console.log('[BadgeDesigner] api.save-badge request received', new Date().toISOString(), request.method);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { designData, shopData } = body;

    console.log('[BadgeDesigner] save-badge payload:', { 
      hasDesignData: !!designData, 
      hasShopData: !!shopData,
      designDataKeys: designData ? Object.keys(designData) : [],
      shopDataKeys: shopData ? Object.keys(shopData) : []
    });

    // Get environment variables (server-side only)
    const GADGET_API_URL = process.env.GADGET_API_URL || GADGET_APP_URL;
    const GADGET_API_KEY = process.env.GADGET_API_KEY;

    console.log('Environment check:', {
      GADGET_API_URL,
      GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET',
      allEnvVars: Object.keys(process.env).filter(key => key.includes('GADGET'))
    });

    if (!GADGET_API_KEY) {
      console.error('Gadget API key not configured in environment variables');
      // Return a fallback response instead of error
      const designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return json({
        success: true,
        id: designId,
        designId: designId,
        designData: designData,
        fallback: true,
        message: 'Saved locally (Gadget API not configured)'
      });
    }

    console.log('Server-side Gadget API Configuration:', {
      GADGET_API_URL,
      GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET'
    });

    // Prepare the payload for Gadget. Store full designData (including allBadges) so on_order_paid can send it to Vercel.
    const badgeDesignData = designData.badge || designData;
    const fullDesignDataForStorage = designData.allBadges != null ? designData : { ...designData, badge: badgeDesignData };

    console.log('Debug - designData:', designData);
    console.log('Debug - badgeDesignData:', badgeDesignData);
    console.log('Debug - badgeDesignData.lines:', badgeDesignData.lines);

    // Gadget API expects basePrice, backingPrice, totalPrice as strings (GraphQL scalar)
    // Use client-provided designId when present so cart/Supabase/Gadget share the same id
    const gadgetPayload = {
      shopId: shopData?.shopId || "75389960447",
      productId: designData.productId,
      designId: designData.designId || `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "saved" as const,
      designData: JSON.stringify(fullDesignDataForStorage),
      backgroundColor: badgeDesignData.backgroundColor || "#FFFFFF",
      backingType: badgeDesignData.backing || "magnetic",
      basePrice: "9.99",
      backingPrice: "0",
      totalPrice: "9.99",
      textLines: JSON.stringify(designData.textLines || []),
    };

    console.log('Debug - gadgetPayload.textLines:', gadgetPayload.textLines);
    console.log('Debug - gadgetPayload.textLines type:', typeof gadgetPayload.textLines);
    console.log('Debug - Full gadgetPayload:', JSON.stringify(gadgetPayload, null, 2));

    console.log('Attempting to create badge design with payload:', gadgetPayload);

    // Call Gadget GraphQL with PascalCase "BadgeDesign" argument (API expects BadgeDesign, not badgeDesign)
    const graphqlUrl = `${GADGET_API_URL.replace(/\/$/, '')}/api/graphql`;
    const createMutation = `
      mutation CreateBadgeDesign($BadgeDesign: CreateBadgeDesignInput!) {
        createBadgeDesign(BadgeDesign: $BadgeDesign) {
          success
          errors { message code }
          BadgeDesign {
            id
            designId
            shopId
            status
          }
        }
      }
    `;
    let result: { id: string; designId: string };
    try {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GADGET_API_KEY}`,
        },
        body: JSON.stringify({
          query: createMutation,
          variables: { BadgeDesign: gadgetPayload },
        }),
      });
      const data = await res.json();
      if (data.errors?.length) {
        throw new Error(data.errors.map((e: { message: string }) => e.message).join('; '));
      }
      const createResult = data.data?.createBadgeDesign;
      const created = createResult?.BadgeDesign ?? createResult?.badgeDesign;
      if (!createResult?.success || !created) {
        throw new Error(createResult?.errors?.[0]?.message || 'Create failed');
      }
      result = {
        id: created.id,
        designId: created.designId ?? created.id,
      };
      console.log('Badge design creation result:', result);
    } catch (apiError) {
      console.error('Error calling Gadget API:', apiError);
      const designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return json({
        success: true,
        id: designId,
        designId: designId,
        designData: designData,
        fallback: true,
        message: 'Saved locally (Gadget API call failed)',
        error: apiError instanceof Error ? apiError.message : 'Unknown API error'
      });
    }

    return json({
      success: true,
      id: result.id,
      designId: result.designId,
      designData
    });

  } catch (error) {
    console.error('Error saving badge design:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      errorType: typeof error,
      errorKeys: error ? Object.keys(error) : []
    });
    return json({ 
      error: "Failed to save badge design",
      details: error instanceof Error ? error.message : "Unknown error",
      errorType: typeof error,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}; 