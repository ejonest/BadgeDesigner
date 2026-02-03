import { Client } from '@gadget-client/allqualitybadges';

function normalizeEnvString(val: any): string | undefined {
  return typeof val === "string" && val.trim() !== "" ? val : undefined;
}

export interface BadgeDesignData {
  id?: string;
  designId?: string;
  productId?: string;
  designData: any;
  createdAt?: string;
  updatedAt?: string;
  fallback?: boolean;
  message?: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  variants: Array<{
    id: string;
    title: string;
    price: string;
  }>;
}

// Create a function that returns the API with proper configuration
export function createApi(gadgetApiUrl?: string, gadgetApiKey?: string) {
  // API configuration
  const GADGET_API_URL = normalizeEnvString(gadgetApiUrl) || 'https://allqualitybadges-development.gadget.app';
  const GADGET_API_KEY = normalizeEnvString(gadgetApiKey);

  // Extract environment name from URL for Gadget client
  const getEnvironmentFromUrl = (url: string): string => {
    if (url.includes('--development')) return 'development';
    if (url.includes('--staging')) return 'staging';
    if (url.includes('--production') || url.includes('allqualitybadges.gadget.app') && !url.includes('--')) return 'production';
    return 'development'; // fallback
  };

  const environment = getEnvironmentFromUrl(GADGET_API_URL);

  console.log('Gadget API Configuration:', {
    GADGET_API_URL,
    environment,
    GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET'
  });

  // API functions using server-side route for saving
  return {
    // Save badge design using server-side API route
    async saveBadgeDesign(designData: any, shopData?: any): Promise<BadgeDesignData> {
      try {
        // Use server-side API route instead of client-side Gadget client
        const response = await fetch('/api/save-badge', {
        method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ designData, shopData }),
      });
      
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        
        return { 
          id: result.id ?? undefined, 
          designData,
          designId: result.designId ?? undefined,
          fallback: result.fallback || false,
          message: result.message
        };
      } catch (error) {
        console.error('Error saving badge design:', error);
        
        // Fallback for server-side or when API fails
        console.warn('Failed to save to backend, using fallback');
        const designId = Date.now().toString();
      return { id: designId, designData };
    }
  },

    // Get badge design by ID (with fallback)
  async getBadgeDesign(id: string): Promise<BadgeDesignData> {
    try {
        // For now, just return a fallback since we don't have a get endpoint yet
        throw new Error('Design not found');
    } catch (error) {
        // Fallback
      throw new Error('Design not found');
    }
  },

  // Update badge design
  async updateBadgeDesign(id: string, updateData: any): Promise<BadgeDesignData> {
    try {
      console.log('updateBadgeDesign called with:', { id, updateData });
      
      // Use server-side API route for updating
      const response = await fetch('/api/update-badge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, updateData }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      return { 
        id: result.id ?? id, 
        designData: result.designData ?? updateData,
        designId: result.designId ?? undefined
      };
    } catch (error) {
      console.error('Error updating badge design:', error);
      throw error;
    }
  },

  // Get product info from Shopify (mock data for now)
  async getProductInfo(productId: string): Promise<ShopifyProduct> {
      // Return mock data as fallback
      return {
        id: productId,
        title: 'Badge Product',
        variants: [
          { id: '1', title: 'Default', price: '10.00' }
        ]
      };
  },

  // Send message to parent window (for Shopify integration)
  sendToParent(message: any) {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage(message, '*');
    }
  },

  // Add to cart functionality - direct Shopify cart API call
  async addToCart(badgeData: any) {
      console.log('addToCart function called with:', badgeData);
      
      try {
        // Resolve Shopify store URL: window.SHOPIFY_STORE_URL, then URL params (storeUrl or shop from iframe), then fallback
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const shopifyStoreUrl =
          (typeof window !== 'undefined' && (window as any).SHOPIFY_STORE_URL) ||
          urlParams?.get('storeUrl') ||
          urlParams?.get('shop') ||
          'badgesonly.myshopify.com';
        
        console.log('Adding to Shopify cart directly from frontend');
        console.log('Shopify store URL:', shopifyStoreUrl);
        console.log('Cart data:', badgeData);

        // Prepare the cart addition data for Shopify
        const cartData = {
          items: [{
            id: badgeData.variantId,
            quantity: badgeData.quantity,
            properties: badgeData.properties
          }]
        };

        console.log('Cart data to send to Shopify:', cartData);

        // Use a more reliable approach - redirect to cart/add with query parameters
        // This avoids CORS issues and doesn't open new tabs
        const params = new URLSearchParams();
        params.append('id', badgeData.variantId);
        params.append('quantity', badgeData.quantity.toString());
        
        // Add properties as query parameters
        Object.entries(badgeData.properties).forEach(([key, value]) => {
          params.append(`properties[${key}]`, value as string);
        });

        const cartUrl = `https://${shopifyStoreUrl}/cart/add?${params.toString()}`;
        
        // Redirect to the cart addition URL (break out of iframe so Shopify loads in top window)
        if (window.top) window.top.location.href = cartUrl;
        else window.location.href = cartUrl;

        // Also send to parent window for additional integration
        this.sendToParent({
          action: 'add-to-cart',
          payload: badgeData
        });

        return { 
          success: true, 
          message: 'Redirecting to add item to cart',
          cartData: { redirectUrl: cartUrl },
          badgeData 
        };

      } catch (error) {
        console.error('Error adding to cart:', error);
        
        // Fallback to just sending to parent window
        this.sendToParent({
          action: 'add-to-cart',
          payload: badgeData
        });
        
        throw error;
      }
  },

  // Upload image to Gadget
  async uploadImage(imageData: string, filename: string, metadata?: any) {
    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData,
          filename,
          contentType: 'image/png',
          metadata
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      return result;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  },

  // Close modal
  closeModal() {
    this.sendToParent({
      action: 'close-modal'
    });
  }
};
}