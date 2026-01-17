import { createClient } from '@supabase/supabase-js'

// Supabase configuration from environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.warn(
    'Supabase environment variables are not set. Please configure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
  )
}

// Client-side Supabase client (for browser)
// Only create if we have the required keys
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Server-side Supabase client (for API routes)
// Only create if we have the required keys
export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null

// Types for badge designs
export interface BadgeDesign {
  id?: string
  design_id: string
  product_id: string
  shop_id: string
  user_id?: string
  background_color?: string
  backing_price?: number
  backing_type?: string
  base_price?: number
  total_price?: number
  design_data?: any
  text_lines?: any
  thumbnail_url?: string
  full_image_url?: string
  status?: 'draft' | 'saved' | 'ordered' | 'archived'
  created_at?: string
  updated_at?: string
}

// Upload helper function
export async function uploadToSupabase(
  file: File, 
  designId: string, 
  type: 'thumbnail' | 'full'
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const fileName = `${designId}-${type}.png`
  const filePath = `${designId}/${fileName}`
  
  const { data, error } = await supabaseAdmin.storage
    .from('badge-images')
    .upload(filePath, file, {
      contentType: 'image/png',
      upsert: true
    })
    
  if (error) {
    console.error('Upload error:', error)
    throw error
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('badge-images')
    .getPublicUrl(filePath)
    
  return publicUrl
}

// Upload to badge-pdfs bucket
export async function uploadToBadgePdfsBucket(
  file: File | Blob,
  fileName: string,
  contentType: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  // First, check if the bucket exists
  const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets()
  
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError)
    throw new Error(`Failed to access Supabase storage: ${bucketsError.message}`)
  }
  
  const badgePdfsBucket = buckets?.find(bucket => bucket.name === 'badge-pdfs')
  if (!badgePdfsBucket) {
    throw new Error('badge-pdfs bucket does not exist. Please create it in your Supabase dashboard under Storage.')
  }

  const filePath = fileName
  
  console.log(`Uploading to badge-pdfs bucket: ${filePath} (${contentType}, ${file instanceof Blob ? file.size : file.size} bytes)`)
  
  const { data, error } = await supabaseAdmin.storage
    .from('badge-pdfs')
    .upload(filePath, file, {
      contentType,
      upsert: true
    })
    
  if (error) {
    console.error('Upload error details:', {
      message: error.message,
      statusCode: error.statusCode,
      error: error.error,
      fileName: filePath
    })
    throw new Error(`Failed to upload file to badge-pdfs bucket: ${error.message}`)
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('badge-pdfs')
    .getPublicUrl(filePath)
  
  console.log(`File uploaded successfully: ${publicUrl}`)
    
  return publicUrl
}

// Database helper functions
export async function saveBadgeDesign(design: BadgeDesign) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const { data, error } = await supabaseAdmin
    .from('badge_designs')
    .upsert(design)
    .select()
    .single()
    
  if (error) {
    console.error('Save error:', error)
    throw error
  }
  
  return data
}

export async function getBadgeDesign(designId: string) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const { data, error } = await supabaseAdmin
    .from('badge_designs')
    .select('*')
    .eq('design_id', designId)
    .single()
    
  if (error) {
    console.error('Get error:', error)
    throw error
  }
  
  return data
}

export async function getCustomerDesigns(customerId: string) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const { data, error } = await supabaseAdmin
    .from('badge_designs')
    .select('*')
    .eq('user_id', customerId)
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Get customer designs error:', error)
    throw error
  }
  
  return data
}

// Badge order items interface - matches actual table schema
export interface BadgeOrderItem {
  id?: string
  order_design_id?: string // UUID reference to badge_designs(id)
  design_id: string // TEXT - links to main order design_id
  badge_index: number // INTEGER - 0 = badge1, 1+ = multiple badges
  badge_id?: string // TEXT - unique ID for this specific badge
  badge_data: any // JSONB - full badge design data (lines, colors, etc.)
  thumbnail_url?: string
  full_image_url?: string
  pdf_url?: string
  shopify_customer_id?: string
  created_at?: string
  updated_at?: string
}

// Save badge order item
export async function saveBadgeOrderItem(item: BadgeOrderItem) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const { data, error } = await supabaseAdmin
    .from('badge_order_items')
    .insert({
      design_id: item.design_id,
      badge_index: item.badge_index,
      badge_id: item.badge_id,
      badge_data: item.badge_data,
      thumbnail_url: item.thumbnail_url,
      full_image_url: item.full_image_url,
      pdf_url: item.pdf_url,
      shopify_customer_id: item.shopify_customer_id,
      order_design_id: item.order_design_id,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()
    
  if (error) {
    console.error('Save badge order item error:', error)
    throw error
  }
  
  return data
}

// Save multiple badge order items (one per badge)
export async function saveBadgeOrderItems(items: BadgeOrderItem[]) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  const itemsToInsert = items.map(item => ({
    design_id: item.design_id,
    badge_index: item.badge_index,
    badge_id: item.badge_id,
    badge_data: item.badge_data,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    pdf_url: item.pdf_url,
    shopify_customer_id: item.shopify_customer_id,
    order_design_id: item.order_design_id,
    created_at: item.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))

  const { data, error } = await supabaseAdmin
    .from('badge_order_items')
    .insert(itemsToInsert)
    .select()
    
  if (error) {
    console.error('Save badge order items error:', error)
    throw error
  }
  
  return data
} 