import { json, type ActionFunctionArgs } from '@remix-run/node';
import { parseOr400, addToCartBodySchema } from '~/utils/validation';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(addToCartBodySchema, body, 'Invalid request body');
    if (!parsed.ok) return parsed.response;
    const { badgeData } = parsed.data;
    
    console.log('Badge data received for cart:', badgeData);
    console.log('Badge text lines:', {
      line1: badgeData.properties['Badge Text Line 1'],
      line2: badgeData.properties['Badge Text Line 2'],
      line3: badgeData.properties['Badge Text Line 3'],
      line4: badgeData.properties['Badge Text Line 4']
    });
    console.log('Custom thumbnail exists:', !!(
      badgeData.properties['_Custom Thumbnail'] ||
      badgeData.properties['Custom Thumbnail'] ||
      badgeData.properties['_custom_thumbnail']
    ));

    // Get Shopify store URL from environment or request
    const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL || 'your-store.myshopify.com';
    
    // Add detailed logging
    console.log('Environment variables check:', {
      SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL,
      shopifyStoreUrl: shopifyStoreUrl,
      allEnvVars: Object.keys(process.env).filter(key => key.includes('SHOPIFY'))
    });
    
    // Prepare the cart addition data for Shopify
    const cartData = {
      items: [{
        id: badgeData.variantId,
        quantity: badgeData.quantity,
        properties: badgeData.properties
      }]
    };

    console.log('Cart data to send to Shopify:', cartData);
    console.log('Shopify cart API URL:', `https://${shopifyStoreUrl}/cart/add.js`);

    // Add to Shopify cart using the Cart API
    try {
      const cartResponse = await fetch(`https://${shopifyStoreUrl}/cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cartData),
      });

      console.log('Shopify cart API response status:', cartResponse.status);
      console.log('Shopify cart API response headers:', Object.fromEntries(cartResponse.headers.entries()));

      if (!cartResponse.ok) {
        const errorText = await cartResponse.text();
        console.error('Shopify cart API error:', errorText);
        throw new Error(`Shopify cart API error: ${cartResponse.status}: ${errorText}`);
      }

      const cartResult = await cartResponse.json();
      console.log('Shopify cart API response:', cartResult);

      return json({ 
        success: true, 
        message: 'Badge added to cart successfully',
        cartData: cartResult,
        badgeData 
      });

    } catch (shopifyError) {
      console.error('Error adding to Shopify cart:', shopifyError);
      
      // Fallback: return success but indicate it's via postMessage
      return json({ 
        success: true, 
        message: 'Badge data prepared for cart addition via postMessage (Shopify API unavailable)',
        fallback: true,
        badgeData 
      });
    }

  } catch (error) {
    console.error('Error in add-to-cart API:', error);
    return json({ error: 'Failed to add to cart' }, { status: 500 });
  }
} 