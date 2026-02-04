import { json, type ActionFunctionArgs } from '@remix-run/node';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { id, updateData } = await request.json();
    console.log('Update badge request:', { id, updateData });

    if (!id) {
      return json({ error: 'Badge design ID is required' }, { status: 400 });
    }

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

    // Call Gadget GraphQL: Gadget schema uses GadgetID (not ID) and UpdateBadgeDesignInput (not InternalBadgeDesignInput)
    const graphqlUrl = `${GADGET_API_URL.replace(/\/$/, '')}/api/graphql`;
    const updateMutation = `
      mutation UpdateBadgeDesign($id: GadgetID!, $badgeDesign: UpdateBadgeDesignInput!) {
        updateBadgeDesign(id: $id, badgeDesign: $badgeDesign) {
          success
          badgeDesign { id designId }
        }
      }
    `;
    const updateInput = {
      fullImageUrl: updateData.fullImageUrl,
      thumbnailUrl: updateData.thumbnailUrl
    };

    console.log('Updating badge design with data:', updateData);

    const res = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GADGET_API_KEY}`,
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: { id, badgeDesign: updateInput },
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
      id: updateResult.badgeDesign?.id ?? updateResult.BadgeDesign?.id ?? id,
      designData: updateData
    });
  } catch (error) {
    console.error('Error in update-badge API:', error);
    return json({ error: 'Failed to update badge design' }, { status: 500 });
  }
} 