import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from '@gadget-client/allqualitybadges';

const GADGET_APP_URL = 'https://all-quality-badge-designer--development.gadget.app';

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

    // Extract environment name from URL for Gadget client
    const getEnvironmentFromUrl = (url: string): string => {
      if (url.includes('--development')) return 'development';
      if (url.includes('--staging')) return 'staging';
      if (url.includes('--production') || (url.includes('all-quality-badge-designer.gadget.app') && !url.includes('--'))) return 'production';
      return 'development'; // fallback
    };

    const environment = getEnvironmentFromUrl(GADGET_API_URL);

    console.log('Server-side Gadget API Configuration:', {
      GADGET_API_URL,
      environment,
      GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET'
    });

    // Create Gadget client instance (server-side, so API key is safe)
    let gadgetClient;
    try {
      gadgetClient = new Client({
        environment: environment,
        authenticationMode: { apiKey: GADGET_API_KEY },
      });
      console.log('Gadget client created successfully');
    } catch (clientError) {
      console.error('Error creating Gadget client:', clientError);
      // Return fallback response
      const designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return json({
        success: true,
        id: designId,
        designId: designId,
        designData: designData,
        fallback: true,
        message: 'Saved locally (Gadget client creation failed)'
      });
    }

    // Prepare the payload for Gadget. Store full designData (including allBadges) so on_order_paid can send it to Vercel.
    const badgeDesignData = designData.badge || designData;
    const fullDesignDataForStorage = designData.allBadges != null ? designData : { ...designData, badge: badgeDesignData };

    console.log('Debug - designData:', designData);
    console.log('Debug - badgeDesignData:', badgeDesignData);
    console.log('Debug - badgeDesignData.lines:', badgeDesignData.lines);

    const gadgetPayload = {
      shopId: shopData?.shopId || "75389960447",
      productId: designData.productId,
      designId: `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "saved" as const,
      designData: JSON.stringify(fullDesignDataForStorage),
      backgroundColor: badgeDesignData.backgroundColor || "#FFFFFF",
      backingType: badgeDesignData.backing || "pin",
      basePrice: 9.99,
      backingPrice: 0,
      totalPrice: 9.99,
      textLines: JSON.stringify(designData.textLines || []),
    };

    console.log('Debug - gadgetPayload.textLines:', gadgetPayload.textLines);
    console.log('Debug - gadgetPayload.textLines type:', typeof gadgetPayload.textLines);
    console.log('Debug - Full gadgetPayload:', JSON.stringify(gadgetPayload, null, 2));

    console.log('Attempting to create badge design with payload:', gadgetPayload);

    // Create the badge design using the Gadget client
    let result;
    try {
      result = await gadgetClient.badgeDesign.create(gadgetPayload);
      console.log('Badge design creation result:', result);
      console.log('Full result object keys:', Object.keys(result));
      console.log('Result designData field:', result.designData);
      console.log('Result textLines field:', result.textLines);
    } catch (apiError) {
      console.error('Error calling Gadget API:', apiError);
      // Return fallback response
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

    // The Gadget client returns the badge design record directly
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