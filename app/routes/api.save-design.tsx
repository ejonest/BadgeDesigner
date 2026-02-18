import type { ActionFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { saveBadgeDesign, deleteSavedDesignsForUser } from '~/utils/supabase'
import type { BadgeDesign } from '~/utils/supabase'

/**
 * Save Design (Supabase only): one saved set per user per shop.
 * Replaces any existing saved design for this user/shop, then inserts the new one.
 * Requires userId (Shopify customer id); no Gadget calls.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const body = await request.json()
    const { designData, shopData } = body

    const userId = designData?.userId ?? shopData?.customerId ?? body.userId
    const shopId = designData?.shopId ?? shopData?.shopId
    const productId = designData?.productId

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return json(
        { error: 'Sign in to save your design. userId (customerId) is required.' },
        { status: 400 }
      )
    }

    if (!shopId || typeof shopId !== 'string' || !shopId.trim()) {
      return json(
        { error: 'Shop information is required.' },
        { status: 400 }
      )
    }

    const badgeDesignData = designData?.designData?.badge ?? designData?.badge ?? designData
    const allBadges = designData?.designData?.allBadges ?? designData?.allBadges
    const firstBadge = Array.isArray(allBadges) ? allBadges[0] : badgeDesignData

    const designId =
      designData?.designId ??
      `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const fullDesignData = designData?.designData ?? {
      badge: firstBadge,
      multipleBadges: Array.isArray(allBadges) && allBadges.length > 1 ? allBadges.slice(1) : [],
      allBadges: Array.isArray(allBadges) ? allBadges : [firstBadge].filter(Boolean),
      timestamp: new Date().toISOString(),
    }

    await deleteSavedDesignsForUser(userId.trim(), shopId.trim())

    const row: BadgeDesign = {
      design_id: designId,
      product_id: productId ?? '',
      shop_id: shopId.trim(),
      user_id: userId.trim(),
      background_color: firstBadge?.backgroundColor ?? '#FFFFFF',
      backing_type: firstBadge?.backing ?? 'magnetic',
      backing_price: designData?.backingPrice ?? 0,
      base_price: designData?.basePrice ?? 9.99,
      total_price: designData?.totalPrice ?? 9.99,
      design_data: fullDesignData,
      text_lines: designData?.textLines ?? firstBadge?.lines ?? [],
      status: 'saved',
    }

    const saved = await saveBadgeDesign(row)

    return json({
      success: true,
      id: saved.id,
      designId: saved.design_id,
      message: 'Design saved. You can load it next time you visit.',
    })
  } catch (error) {
    console.error('[BadgeDesigner] api.save-design error:', error)
    let details = 'Unknown error'
    if (error instanceof Error) {
      details = error.message
    } else if (error && typeof error === 'object') {
      const o = error as Record<string, unknown>
      if (typeof o.message === 'string') details = o.message
      else if (typeof o.details === 'string') details = o.details
      else if (typeof o.error_description === 'string') details = o.error_description
      else details = JSON.stringify(o)
    }
    return json(
      {
        error: 'Failed to save design',
        details,
      },
      { status: 500 }
    )
  }
}
