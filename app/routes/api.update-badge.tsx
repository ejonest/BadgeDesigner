import { json, type ActionFunctionArgs } from '@remix-run/node';
import { uploadDataUrlToBadgeImagesBucket } from '~/utils/supabase';
import { parseOr400, updateBadgeBodySchema } from '~/utils/validation';

const DATA_URL_PREFIX = 'data:image/';

function isDataUrl(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(DATA_URL_PREFIX);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(updateBadgeBodySchema, body, 'Invalid request body');
    if (!parsed.ok) return parsed.response;
    const { id, updateData } = parsed.data;
    console.log('Update badge request:', { id, updateData: updateData ? { fullImageUrl: (updateData as Record<string, unknown>)?.fullImageUrl ? String((updateData as Record<string, unknown>).fullImageUrl).slice(0, 50) : undefined, thumbnailUrl: (updateData as Record<string, unknown>)?.thumbnailUrl ? String((updateData as Record<string, unknown>).thumbnailUrl).slice(0, 50) : undefined } : updateData });

    const GADGET_API_URL = process.env.GADGET_API_URL || 'https://all-quality-badge-designer--development.gadget.app';
    const GADGET_API_KEY = process.env.GADGET_API_KEY;

    console.log('Environment check for update:', {
      GADGET_API_URL,
      GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET'
    });

    if (!GADGET_API_KEY) {
      console.error('Gadget API key not configured for update');
      return json({
        success: true,
        message: 'Update skipped (Gadget API not configured)',
        id: id,
        designData: updateData
      });
    }

    // Gadget expects normal URL strings for fullImageUrl/thumbnailUrl, not base64 data URLs.
    // If the client sent data URLs, upload to Supabase Storage first and send the resulting URLs.
    let fullImageUrl = updateData?.fullImageUrl ?? '';
    let thumbnailUrl = updateData?.thumbnailUrl ?? '';
    const designIdForPath = String(id);

    if (isDataUrl(fullImageUrl) || isDataUrl(thumbnailUrl)) {
      try {
        if (isDataUrl(fullImageUrl)) {
          fullImageUrl = await uploadDataUrlToBadgeImagesBucket(fullImageUrl, designIdForPath, 'full');
          console.log('[BadgeDesigner] Uploaded full image to Supabase, URL length:', fullImageUrl.length);
        }
        if (isDataUrl(thumbnailUrl)) {
          thumbnailUrl = await uploadDataUrlToBadgeImagesBucket(thumbnailUrl, designIdForPath, 'thumb');
          console.log('[BadgeDesigner] Uploaded thumbnail to Supabase, URL length:', thumbnailUrl.length);
        }
      } catch (uploadError) {
        console.error('[BadgeDesigner] Image upload to Supabase failed:', uploadError);
        return json({
          success: false,
          message: 'Failed to upload images to storage (Gadget expects URLs, not base64). Ensure Supabase is configured.',
          id,
          designData: updateData,
          error: uploadError instanceof Error ? uploadError.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    // Gadget's UpdateBadgeDesignInput does not include fullImageUrl or thumbnailUrl (only e.g. backgroundColor, designData, status).
    // We still upload images to Supabase above so URLs exist for the link-order/Supabase flow. Send only fields that exist on the schema.
    const updateInput: Record<string, string> = {};
    // If your Gadget BadgeDesign model adds fullImageUrl/thumbnailUrl, uncomment:
    // if (fullImageUrl) updateInput.fullImageUrl = fullImageUrl;
    // if (thumbnailUrl) updateInput.thumbnailUrl = thumbnailUrl;

    console.log('Updating badge design in Gadget (image URLs uploaded to Supabase; Gadget schema has no image URL fields):', { fullImageUrlLength: fullImageUrl.length, thumbnailUrlLength: thumbnailUrl.length });

    // Call Gadget GraphQL: Gadget schema uses GadgetID, UpdateBadgeDesignInput, and PascalCase BadgeDesign (argument + result)
    const graphqlUrl = `${GADGET_API_URL.replace(/\/$/, '')}/api/graphql`;
    const updateMutation = `
      mutation UpdateBadgeDesign($id: GadgetID!, $BadgeDesign: UpdateBadgeDesignInput!) {
        updateBadgeDesign(id: $id, BadgeDesign: $BadgeDesign) {
          success
          BadgeDesign { id designId }
        }
      }
    `;

    const res = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GADGET_API_KEY}`,
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: { id, BadgeDesign: updateInput },
      }),
    });
    const data = await res.json();

    if (data.errors?.length) {
      console.error('Error updating badge design in Gadget:', data.errors);
      return json({
        success: false,
        message: 'Update failed (Gadget API call failed)',
        id: id,
        designData: updateData,
        error: data.errors.map((e: { message: string }) => e.message).join('; ')
      });
    }

    const updateResult = data.data?.updateBadgeDesign;
    if (!updateResult?.success) {
      return json({
        success: false,
        message: 'Update failed - no result returned',
        id: id,
        designData: updateData
      });
    }

    console.log('Badge design update result:', updateResult);
    return json({
      success: true,
      message: 'Badge design updated successfully',
      id: updateResult.BadgeDesign?.id ?? updateResult.badgeDesign?.id ?? id,
      designData: updateData,
      fullImageUrl,
      thumbnailUrl
    });
  } catch (error) {
    console.error('Error in update-badge API:', error);
    return json({ error: 'Failed to update badge design' }, { status: 500 });
  }
} 