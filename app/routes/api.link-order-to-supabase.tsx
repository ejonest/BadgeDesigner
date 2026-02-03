import { json, type ActionFunctionArgs } from '@remix-run/node'
import { updateBadgeOrderItemsByDesignIds } from '~/utils/supabase'

function getSecretFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null
  }
  const xHeader = request.headers.get('X-Link-Order-Secret')
  if (xHeader) {
    return xHeader.trim() || null
  }
  return null
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 })
  }

  const secret = process.env.LINK_ORDER_SECRET
  if (!secret) {
    console.error('LINK_ORDER_SECRET is not configured')
    return json(
      { error: 'Server configuration error', message: 'Link order secret not configured' },
      { status: 500 }
    )
  }

  const providedSecret = getSecretFromRequest(request)
  if (providedSecret !== secret) {
    return json({ error: 'Unauthorized', message: 'Invalid or missing link order secret' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const shopifyOrderId = body.shopifyOrderId as string | undefined
    const shopifyOrderNumber = body.shopifyOrderNumber as string | undefined
    const lineItems = body.lineItems as Array<{ designId?: string; gadgetDesignId?: string }> | undefined

    if (!shopifyOrderId || typeof shopifyOrderId !== 'string' || !shopifyOrderId.trim()) {
      return json(
        { error: 'Bad request', message: 'shopifyOrderId is required' },
        { status: 400 }
      )
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return json(
        { error: 'Bad request', message: 'lineItems must be a non-empty array' },
        { status: 400 }
      )
    }

    const designIds = lineItems
      .map((item) => (item.designId ?? item.gadgetDesignId) as string | undefined)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '')

    if (designIds.length === 0) {
      return json(
        { error: 'Bad request', message: 'Each lineItem must have designId or gadgetDesignId' },
        { status: 400 }
      )
    }

    const { data, error } = await updateBadgeOrderItemsByDesignIds(
      designIds,
      shopifyOrderId.trim(),
      shopifyOrderNumber != null ? String(shopifyOrderNumber).trim() : null
    )

    if (error) {
      throw error
    }

    const updatedCount = Array.isArray(data) ? data.length : 0
    return json({
      success: true,
      updatedCount,
      message: `Updated ${updatedCount} badge order item(s) with shopify_order_id`,
    })
  } catch (err) {
    console.error('Link order to Supabase error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json(
      { error: 'Failed to link order to Supabase', message },
      { status: 500 }
    )
  }
}
