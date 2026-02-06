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
  const GADGET_APP_URL = 'https://all-quality-badge-designer--development.gadget.app';
  const GADGET_API_URL = normalizeEnvString(gadgetApiUrl) || GADGET_APP_URL;
  const GADGET_API_KEY = normalizeEnvString(gadgetApiKey);

  // Extract environment name from URL for Gadget client
  const getEnvironmentFromUrl = (url: string): string => {
    if (url.includes('--development')) return 'development';
    if (url.includes('--staging')) return 'staging';
    if (url.includes('--production') || (url.includes('all-quality-badge-designer.gadget.app') && !url.includes('--'))) return 'production';
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

  // Add to cart functionality - direct Shopify cart API call (single item)
  async addToCart(badgeData: any) {
      return this.addToCartMultiple([badgeData]);
  },

  // Add one or more badge line items to cart. Single item: redirect to cart/add. Multiple: postMessage for theme to call cart/add.js.
  async addToCartMultiple(cartItems: Array<{ variantId: string; quantity: number; properties: Record<string, string> }>) {
      if (!cartItems || cartItems.length === 0) {
        console.error('addToCartMultiple: no items provided');
        return { success: false, message: 'No items to add' };
      }
      try {
        if (cartItems.length === 1) {
          const badgeData = cartItems[0];
          const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          const shopifyStoreUrl =
            (typeof window !== 'undefined' && (window as any).SHOPIFY_STORE_URL) ||
            urlParams?.get('storeUrl') ||
            urlParams?.get('shop') ||
            'badgesonly.myshopify.com';
          const params = new URLSearchParams();
          params.append('id', badgeData.variantId);
          params.append('quantity', badgeData.quantity.toString());
          Object.entries(badgeData.properties).forEach(([key, value]) => {
            params.append(`properties[${key}]`, value as string);
          });
          const cartUrl = `https://${shopifyStoreUrl}/cart/add?${params.toString()}`;
          if (window.top) window.top.location.href = cartUrl;
          else window.location.href = cartUrl;
          this.sendToParent({ action: 'add-to-cart', payload: badgeData });
          return { success: true, message: 'Redirecting to add item to cart', cartData: { redirectUrl: cartUrl }, badgeData };
        }
        this.sendToParent({ action: 'add-to-cart-multiple', payload: { items: cartItems } });
        return { success: true, message: `Adding ${cartItems.length} items to cart (theme will add via cart/add.js)` };
      } catch (error) {
        console.error('Error adding to cart:', error);
        if (cartItems.length === 1) {
          this.sendToParent({ action: 'add-to-cart', payload: cartItems[0] });
        } else {
          this.sendToParent({ action: 'add-to-cart-multiple', payload: { items: cartItems } });
        }
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