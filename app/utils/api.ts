import { Client } from '@gadget-client/allqualitybadges';
import {
  getDesignerApiPaths,
  getDesignerLibraryApiPaths,
  type DesignerId,
} from '~/config/designers';
import {
  isDesignerEmbeddedInStorefront,
  resolveShopifyStoreUrl,
  sanitizeCartLineItems,
  waitForStorefrontCartAddAck,
  type CartAddResult,
  type CartLineItemPayload,
} from '~/utils/shopifyCartClient';

function normalizeEnvString(val: any): string | undefined {
  return typeof val === "string" && val.trim() !== "" ? val : undefined;
}

export interface AddToCartOptions {
  /**
   * Design id of the cart line this design replaces. The theme removes lines
   * carrying that Design ID once the new lines are added.
   */
  replaceDesignId?: string | null;
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

export interface CreateApiOptions {
  /** Routes save/send calls to the matching designer (badge, sign, plaque, …). */
  designerId?: DesignerId;
}

export type DesignLibraryMilestoneKind = "manual" | "cart" | "ordered";

export interface DesignLibraryListItem {
  design_id: string;
  save_kind: string | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  item_count: number;
  isAutosave: boolean;
}

// Create a function that returns the API with proper configuration
export function createApi(
  gadgetApiUrl?: string,
  gadgetApiKey?: string,
  options?: CreateApiOptions,
) {
  const designerId = options?.designerId ?? "badge";
  const designerPaths = getDesignerApiPaths(designerId);
  const libraryPaths = getDesignerLibraryApiPaths(designerId);
  // API configuration (Gadget client / logging)
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
        const response = await fetch(designerPaths.save, {
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

    /** Save design milestone to Supabase (manual / cart / ordered). Requires userId in designData or shopData. */
    async saveDesignToSupabase(
      designData: any,
      shopData?: any,
      options?: { saveKind?: DesignLibraryMilestoneKind },
    ): Promise<BadgeDesignData> {
      const saveUrl = libraryPaths.saveDesign;
      const payload: Record<string, unknown> = { designData, shopData };
      if (options?.saveKind) payload.saveKind = options.saveKind;
      const response = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.details || err.error || `Save failed: ${response.status}`;
        throw new Error(msg);
      }
      const result = await response.json();
      return {
        id: result.id,
        designId: result.designId,
        designData,
        message: result.message,
      };
    },

    /** Get latest saved design for user/shop from Supabase (for "Load previous design?"). */
    async getSavedDesign(shopId: string, userId: string): Promise<{ saved: boolean; design: { design_id: string; design_data: any; updated_at?: string; backing_type?: string } | null }> {
      const params = new URLSearchParams({ shop: shopId, userId });
      const loadUrl = `${libraryPaths.savedDesign}?${params}`;
      const response = await fetch(loadUrl);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Load failed: ${response.status}`);
      }
      return response.json();
    },

    /** Debounced cloud autosave (one row per user/shop). */
    async autosaveDesignToSupabase(
      designData: any,
      shopData?: any,
    ): Promise<{ id?: string; designId?: string }> {
      const url = libraryPaths.autosaveDesign;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designData, shopData }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg =
          (err as { details?: string }).details ||
          (err as { error?: string }).error ||
          `Autosave failed: ${response.status}`;
        throw new Error(msg);
      }
      const result = await response.json();
      return { id: result.id, designId: result.designId };
    },

    /** Design gallery list (autosave first in `items`, then milestones). */
    async getSavedDesignsLibrary(
      shopId: string,
      userId: string,
    ): Promise<{
      items: DesignLibraryListItem[];
      autosave: Omit<DesignLibraryListItem, "isAutosave"> | null;
      milestones: Omit<DesignLibraryListItem, "isAutosave">[];
    }> {
      const params = new URLSearchParams({ shop: shopId, userId });
      const listUrl = `${libraryPaths.savedDesigns}?${params}`;
      const response = await fetch(listUrl);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `List failed: ${response.status}`,
        );
      }
      return response.json();
    },

    /** Delete one library milestone (manual/cart/ordered) to free a slot. Not for autosave. */
    async deleteDesignLibraryMilestone(
      shopId: string,
      userId: string,
      designId: string,
    ): Promise<void> {
      const url = libraryPaths.deleteMilestone;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, userId, designId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg =
          (err as { details?: string }).details ||
          (err as { error?: string }).error ||
          `Delete failed: ${response.status}`;
        throw new Error(msg);
      }
    },

    /** Full design row for one gallery entry (verify user/shop). */
    async getSavedDesignDetail(
      shopId: string,
      userId: string,
      designId: string,
    ): Promise<{
      found: boolean;
      design: {
        design_id: string;
        design_data: any;
        updated_at?: string;
        backing_type?: string;
        save_kind?: string;
      } | null;
    }> {
      const params = new URLSearchParams({
        shop: shopId,
        userId,
        designId,
      });
      const detailUrl = `${libraryPaths.savedDesignDetail}?${params}`;
      const response = await fetch(detailUrl);
      if (response.status === 404) {
        const body = await response.json().catch(() => ({}));
        return {
          found: !!(body as { found?: boolean }).found,
          design: null,
        };
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            `Load detail failed: ${response.status}`,
        );
      }
      return response.json();
    },

    /**
     * Rebuild a design from its cart order-item rows so a cart line can be reopened
     * for editing. Works for guests: no customer id required, the design id is the key.
     */
    async getCartDesign(designId: string): Promise<{
      found: boolean;
      design: {
        design_id: string;
        design_data: any;
        backing_type?: string;
        quantities?: number[];
      } | null;
    }> {
      const params = new URLSearchParams({ designId, designer: designerId });
      const response = await fetch(`/api/cart-design?${params}`);
      if (response.status === 404) {
        return { found: false, design: null };
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            `Load cart design failed: ${response.status}`,
        );
      }
      return response.json();
    },

    /** Housekeeping after an edited design replaced its cart line; failures are not fatal. */
    async markCartDesignReplaced(designId: string): Promise<void> {
      await fetch("/api/cart-design-replaced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, designer: designerId }),
      });
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
  async addToCart(badgeData: any, options?: AddToCartOptions) {
      return this.addToCartMultiple([badgeData], options);
  },

  // Add one or more badge line items to cart. Embedded: parent theme calls cart/add.js and acks. Standalone single item: redirect to cart/add.
  async addToCartMultiple(
    cartItems: CartLineItemPayload[],
    options?: AddToCartOptions,
  ): Promise<CartAddResult> {
      if (!cartItems || cartItems.length === 0) {
        console.error('addToCartMultiple: no items provided');
        return { success: false, message: 'No items to add' };
      }
      const items = sanitizeCartLineItems(cartItems);
      const replaceDesignId = options?.replaceDesignId || undefined;
      const requestId = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      try {
        if (isDesignerEmbeddedInStorefront()) {
          this.sendToParent({ action: 'add-to-cart-multiple', requestId, payload: { items, replaceDesignId } });
          const ack = await waitForStorefrontCartAddAck(requestId);
          if (ack.success === false) {
            return {
              success: false,
              message: ack.error || 'Failed to add to cart',
            };
          }
          return {
            success: true,
            message:
              ack.success === true
                ? `Added ${items.length} item(s) to cart`
                : `Adding ${items.length} item(s) to cart`,
          };
        }
        if (items.length === 1) {
          const badgeData = items[0];
          const shopifyStoreUrl = resolveShopifyStoreUrl();
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
        this.sendToParent({ action: 'add-to-cart-multiple', requestId, payload: { items, replaceDesignId } });
        const ack = await waitForStorefrontCartAddAck(requestId);
        if (ack.success === false) {
          return { success: false, message: ack.error || 'Failed to add to cart' };
        }
        return {
          success: true,
          message:
            ack.success === true
              ? `Added ${items.length} items to cart`
              : `Adding ${items.length} items to cart`,
        };
      } catch (error) {
        console.error('Error adding to cart:', error);
        if (items.length === 1) {
          this.sendToParent({ action: 'add-to-cart', payload: items[0] });
        } else {
          this.sendToParent({ action: 'add-to-cart-multiple', requestId, payload: { items, replaceDesignId } });
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