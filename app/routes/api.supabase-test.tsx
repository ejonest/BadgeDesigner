import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { supabaseAdmin } from '~/utils/supabase'

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Test database connection
    const { data: designs, error: designsError } = await supabaseAdmin
      .from('badge_designs')
      .select('count')
      .limit(1)
    
    // Test storage connection
    const { data: buckets, error: bucketsError } = await supabaseAdmin.storage
      .listBuckets()
    
    const badgeImagesBucket = buckets?.find(bucket => bucket.name === 'badge-images')
    
    return json({
      success: true,
      database: {
        connected: !designsError,
        error: designsError?.message,
        tableExists: !designsError,
        count: designs?.length || 0
      },
      storage: {
        connected: !bucketsError,
        error: bucketsError?.message,
        buckets: buckets?.map(b => b.name) || [],
        badgeImagesBucket: !!badgeImagesBucket
      },
      message: 'Supabase connection test completed'
    })
    
  } catch (error) {
    console.error('Supabase test error:', error)
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to test Supabase connection'
    }, { status: 500 })
  }
} 