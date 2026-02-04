import { json, type ActionFunctionArgs } from '@remix-run/node'
import {
  getStoragePublicUrl,
  convertBadgeToOrderItem,
  saveBadgeOrderItems,
} from '~/utils/supabase'
import type { Badge } from '~/types/badge'

const BADGE_PDFS_BUCKET = 'badge-pdfs'
const BADGE_IMAGES_BUCKET = 'badge-images'

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

/** Build storage URLs for a design (same paths as api.send-to-supabase uploads). */
function buildStorageUrls(designId: string, badgeCount: number) {
  const pdfPath = `${designId}/badge-design.pdf`
  const pdfUrl = getStoragePublicUrl(BADGE_PDFS_BUCKET, pdfPath)
  const thumbnailUrls: string[] = []
  const fullImageUrls: string[] = []
  for (let i = 0; i < badgeCount; i++) {
    thumbnailUrls.push(
      getStoragePublicUrl(BADGE_IMAGES_BUCKET, `${designId}/badge-${i}-thumbnail.png`)
    )
    fullImageUrls.push(
      getStoragePublicUrl(BADGE_IMAGES_BUCKET, `${designId}/badge-${i}-design.svg`)
    )
  }
  return { pdfUrl, thumbnailUrls, fullImageUrls }
}

/** Normalize designData from Gadget: may be object with allBadges or badge, or raw badge. */
function getBadgesFromDesignData(designData: unknown): Badge[] {
  if (designData == null) return []
  const data = typeof designData === 'string' ? JSON.parse(designData) : designData
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data.allBadges) && data.allBadges.length > 0) return data.allBadges
  if (data.badge && typeof data.badge === 'object') return [data.badge]
  if (data.lines != null && typeof data.backgroundColor === 'string') return [data as Badge]
  return []
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
    const shopifyCustomerId = body.shopifyCustomerId as string | undefined
    const lineItems = body.lineItems as Array<{
      designId?: string
      gadgetDesignId?: string
      designData?: unknown
    }> | undefined

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

    const orderIdTrimmed = shopifyOrderId.trim()
    const orderNumberTrimmed =
      shopifyOrderNumber != null && shopifyOrderNumber !== ''
        ? String(shopifyOrderNumber).trim()
        : undefined
    const customerIdTrimmed =
      shopifyCustomerId != null && shopifyCustomerId !== ''
        ? String(shopifyCustomerId).trim()
        : undefined

    const allBadgeOrderItems: ReturnType<typeof convertBadgeToOrderItem>[] = []

    for (const item of lineItems) {
      const designId = (item.designId ?? item.gadgetDesignId)?.trim()
      if (!designId) {
        console.warn('link-order: lineItem missing designId and gadgetDesignId, skipping')
        continue
      }
      const designData = item.designData
      const badges = getBadgesFromDesignData(designData)
      if (badges.length === 0) {
        console.warn(`link-order: no badges in designData for designId ${designId}, skipping`)
        continue
      }

      const { pdfUrl, thumbnailUrls, fullImageUrls } = buildStorageUrls(designId, badges.length)

      for (let badgeIndex = 0; badgeIndex < badges.length; badgeIndex++) {
        const badge = badges[badgeIndex] as Badge
        const badgeOrderItem = convertBadgeToOrderItem(badge, designId, badgeIndex, {
          shopify_order_id: orderIdTrimmed,
          shopify_order_number: orderNumberTrimmed,
          shopify_customer_id: customerIdTrimmed,
          pdf_url: pdfUrl,
          thumbnail_url: thumbnailUrls[badgeIndex],
          full_image_url: fullImageUrls[badgeIndex],
        })
        allBadgeOrderItems.push(badgeOrderItem)
      }
    }

    if (allBadgeOrderItems.length === 0) {
      return json(
        { error: 'Bad request', message: 'No valid badge items to insert (missing designId or designData)' },
        { status: 400 }
      )
    }

    const saved = await saveBadgeOrderItems(allBadgeOrderItems)
    const insertedCount = Array.isArray(saved) ? saved.length : 0

    return json({
      success: true,
      insertedCount,
      message: `Inserted ${insertedCount} badge order item(s) with shopify_order_id`,
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
