import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { getLatestSavedDesign } from '~/utils/supabase'

/**
 * GET /api/saved-design?shop=...&userId=...
 * Returns the latest saved design for this user/shop from Supabase (one set per user).
 * Used by BadgeDesigner to show "Load previous design?" on mount.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const shopId = url.searchParams.get('shop')
  const userId = url.searchParams.get('userId')

  if (!userId || !shopId) {
    return json(
      { error: 'userId and shop are required' },
      { status: 400 }
    )
  }

  try {
    const design = await getLatestSavedDesign(userId, shopId)
    if (!design) {
      return json({ saved: false, design: null })
    }
    return json({
      saved: true,
      design: {
        design_id: design.design_id,
        design_data: design.design_data,
        updated_at: design.updated_at,
      },
    })
  } catch (error) {
    console.error('[BadgeDesigner] api.saved-design loader error:', error)
    return json(
      {
        error: 'Failed to load saved design',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
