import { createClient } from '@supabase/supabase-js'
import type { Badge } from '~/types/badge'
import { 
  BACKGROUND_COLORS, 
  EXTENDED_BACKGROUND_COLORS, 
  SMART_PALETTE_COLORS, 
  FONT_COLORS
} from '~/constants/colors'

// Helper function to get current timestamp in PST/PDT (America/Los_Angeles timezone)
// Returns ISO string formatted for PostgreSQL timestamp with time zone
function getPacificTimestamp(): string {
  const now = new Date()
  
  // Get Pacific time components
  const pacificParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now)
  
  const year = pacificParts.find(p => p.type === 'year')?.value || ''
  const month = pacificParts.find(p => p.type === 'month')?.value || ''
  const day = pacificParts.find(p => p.type === 'day')?.value || ''
  const hour = pacificParts.find(p => p.type === 'hour')?.value || ''
  const minute = pacificParts.find(p => p.type === 'minute')?.value || ''
  const second = pacificParts.find(p => p.type === 'second')?.value || ''
  
  // Calculate timezone offset by comparing UTC and Pacific times
  // Create two formatters to get the same moment in both timezones
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  const utcParts = utcFormatter.formatToParts(now)
  const utcYear = parseInt(utcParts.find(p => p.type === 'year')?.value || '0')
  const utcMonth = parseInt(utcParts.find(p => p.type === 'month')?.value || '0') - 1
  const utcDay = parseInt(utcParts.find(p => p.type === 'day')?.value || '0')
  const utcHour = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0')
  const utcMinute = parseInt(utcParts.find(p => p.type === 'minute')?.value || '0')
  const utcSecond = parseInt(utcParts.find(p => p.type === 'second')?.value || '0')
  
  const pacificYear = parseInt(year)
  const pacificMonth = parseInt(month) - 1
  const pacificDay = parseInt(day)
  const pacificHour = parseInt(hour)
  const pacificMinute = parseInt(minute)
  const pacificSecond = parseInt(second)
  
  // Create Date objects in UTC representing both times
  const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour, utcMinute, utcSecond))
  const pacificAsUtc = new Date(Date.UTC(pacificYear, pacificMonth, pacificDay, pacificHour, pacificMinute, pacificSecond))
  
  // Calculate offset in hours (Pacific is behind UTC)
  const offsetMs = pacificAsUtc.getTime() - utcDate.getTime()
  const offsetHours = Math.round(offsetMs / (1000 * 60 * 60))
  
  // Format offset (Pacific is UTC-8 (PST) or UTC-7 (PDT))
  const offsetSign = offsetHours <= 0 ? '-' : '+'
  const offsetHoursAbs = Math.abs(offsetHours)
  const offsetString = `${offsetSign}${offsetHoursAbs.toString().padStart(2, '0')}:00`
  
  // Return ISO format: YYYY-MM-DDTHH:MM:SS+/-HH:MM
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetString}`
}

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

// Upload from a base64 data URL (e.g. from canvas toDataURL) to badge-images and return public URL.
// Use for Gadget update flow where client sends data URLs; Gadget expects normal URL strings.
export async function uploadDataUrlToBadgeImagesBucket(
  dataUrl: string,
  designId: string,
  fileNameSuffix: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('uploadDataUrlToBadgeImagesBucket expects a data URL starting with data:image/')
  }
  const base64Marker = ';base64,'
  const base64Index = dataUrl.indexOf(base64Marker)
  if (base64Index === -1) {
    throw new Error('Invalid image data URL format: missing ;base64,')
  }
  const contentType = dataUrl.slice(5, base64Index)
  const rawBase64 = dataUrl.slice(base64Index + base64Marker.length)
  const base64 = rawBase64.replace(/\s/g, '')
  if (!base64.length) {
    throw new Error('Invalid image data URL: empty base64 payload')
  }
  const buffer = Buffer.from(base64, 'base64')
  const ext = contentType === 'image/svg+xml' ? 'svg' : 'png'
  const fileName = `${designId}/gadget-update-${fileNameSuffix}.${ext}`
  const blob = new Blob([buffer], { type: contentType })
  return uploadToBadgeImagesBucket(blob, fileName, contentType)
}

// In Node, FormData File/Blob can be stream-backed; convert to Buffer so Supabase gets exact bytes.
async function toUploadBuffer(file: File | Blob): Promise<Buffer> {
  const ab = await file.arrayBuffer()
  return Buffer.from(ab)
}

// Upload to badge-images bucket - ONLY accepts image files (PNG, etc.)
export async function uploadToBadgeImagesBucket(
  file: File | Blob,
  fileName: string,
  contentType: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  // Validate that only image files (including SVG) are uploaded to this bucket
  const isImage = contentType.startsWith('image/') || contentType === 'image/svg+xml'
  const hasImageExtension = fileName.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)
  if (!isImage && !hasImageExtension) {
    throw new Error(`Invalid file type for badge-images bucket. Only image files (including SVG) are allowed. Received: ${contentType}`)
  }

  // First, check if the bucket exists
  const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets()
  
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError)
    throw new Error(`Failed to access Supabase storage: ${bucketsError.message}`)
  }
  
  const badgeImagesBucket = buckets?.find(bucket => bucket.name === 'badge-images')
  if (!badgeImagesBucket) {
    throw new Error('badge-images bucket does not exist. Please create it in your Supabase dashboard under Storage.')
  }

  const filePath = fileName
  const body = await toUploadBuffer(file)
  console.log(`Uploading image to badge-images bucket: ${filePath} (${contentType}, ${body.length} bytes)`)
  
  const { data, error } = await supabaseAdmin.storage
    .from('badge-images')
    .upload(filePath, body, {
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
    throw new Error(`Failed to upload file to badge-images bucket: ${error.message}`)
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('badge-images')
    .getPublicUrl(filePath)
  
  console.log(`Image uploaded successfully to badge-images: ${publicUrl}`)
    
  return publicUrl
}

// Upload to badge-pdfs bucket - ONLY accepts PDF files
export async function uploadToBadgePdfsBucket(
  file: File | Blob,
  fileName: string,
  contentType: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }

  // Validate that only PDF files are uploaded to this bucket
  if (contentType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Invalid file type for badge-pdfs bucket. Only PDF files are allowed. Received: ${contentType}`)
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
  const body = await toUploadBuffer(file)
  console.log(`Uploading PDF to badge-pdfs bucket: ${filePath} (${contentType}, ${body.length} bytes)`)
  
  const { data, error } = await supabaseAdmin.storage
    .from('badge-pdfs')
    .upload(filePath, body, {
      contentType: 'application/pdf', // Force PDF content type
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
  
  console.log(`PDF uploaded successfully to badge-pdfs: ${publicUrl}`)
    
  return publicUrl
}

// Get public URL for a file in Supabase storage (no upload). Use same bucket names and path conventions as uploads.
export function getStoragePublicUrl(bucket: string, path: string): string {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }
  const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
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
  shopify_order_id?: string // TEXT - Shopify order ID
  shopify_order_number?: string // TEXT - human-readable order number (e.g. #1001)
  design_id: string // TEXT - links to main order design_id
  badge_id?: string // TEXT - unique ID for this specific badge
  background_color?: string // Format: "ColorName #hexcode" or "#hexcode"
  // Line 1 properties
  line_1_text?: string
  line_1_font?: string
  line_1_font_size?: number
  line_1_bold?: boolean
  line_1_underline?: boolean
  line_1_italicize?: boolean
  line_1_color?: string
  line_1_alignment?: string
  // Line 2 properties
  line_2_text?: string
  line_2_font?: string
  line_2_font_size?: number
  line_2_bold?: boolean
  line_2_underline?: boolean
  line_2_italicize?: boolean
  line_2_color?: string
  line_2_alignment?: string
  // Line 3 properties
  line_3_text?: string
  line_3_font?: string
  line_3_font_size?: number
  line_3_bold?: boolean
  line_3_underline?: boolean
  line_3_italicize?: boolean
  line_3_color?: string
  line_3_alignment?: string
  // Line 4 properties
  line_4_text?: string
  line_4_font?: string
  line_4_font_size?: number
  line_4_bold?: boolean
  line_4_underline?: boolean
  line_4_italicize?: boolean
  line_4_color?: string
  line_4_alignment?: string
  thumbnail_url?: string
  full_image_url?: string
  pdf_url?: string
  shopify_customer_id?: string
  created_at?: string
  updated_at?: string
}

// Helper function to get color name from hex code
// Checks all color arrays from colors.ts, returns "User Specified" if not found
function getColorName(hex: string | undefined): string {
  if (!hex) return ''
  
  // Normalize hex code (ensure it has # and is uppercase)
  const normalizedHex = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
  
  // Check all color arrays from colors.ts
  // Combine all color arrays into a single search
  const allColorArrays = [
    ...BACKGROUND_COLORS,
    ...EXTENDED_BACKGROUND_COLORS,
    ...SMART_PALETTE_COLORS,
    ...FONT_COLORS
  ]
  
  // Find matching color
  const color = allColorArrays.find(c => c.value.toUpperCase() === normalizedHex)
  
  if (color) {
    return color.name
  }
  
  // If no match found, return "User Specified"
  return 'User Specified'
}

// Helper function to format color as "ColorName #hexcode" or "User Specified #hexcode"
function formatColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined
  
  // Ensure hex has # prefix
  const hexWithHash = hex.startsWith('#') ? hex : `#${hex}`
  const colorName = getColorName(hex)
  
  // Always include the name (either the actual name or "User Specified")
  return `${colorName} ${hexWithHash}`
}

// Helper function to calculate fontSize from sizeNorm
// Uses templateId to determine designBox height (96px for 1x3, 144px for 1.5x3)
function calculateFontSize(line: { sizeNorm?: number; fontSize?: number }, templateId?: string): number | undefined {
  // If fontSize is already set, use it
  if (line.fontSize !== undefined) {
    return Math.round(line.fontSize)
  }
  
  // Otherwise calculate from sizeNorm
  if (line.sizeNorm !== undefined) {
    // Determine designBox height from templateId
    // 1x3 badges are typically 96px tall, 1.5x3 badges are 144px tall
    let designBoxHeight = 96 // default for 1x3
    if (templateId && templateId.includes('1.5')) {
      designBoxHeight = 144
    }
    
    const fontSize = line.sizeNorm * designBoxHeight
    return Math.round(fontSize)
  }
  
  return undefined
}

// Helper function to convert Badge object to BadgeOrderItem format
export function convertBadgeToOrderItem(
  badge: Badge,
  designId: string,
  badgeIndex: number,
  options?: {
    shopify_order_id?: string
    shopify_order_number?: string
    thumbnail_url?: string
    full_image_url?: string
    pdf_url?: string
    shopify_customer_id?: string
  }
): BadgeOrderItem {
  const lines = badge.lines || []
  
  return {
    design_id: designId,
    badge_id: badge.id || `badge-${badgeIndex}`,
    shopify_order_id: options?.shopify_order_id,
    shopify_order_number: options?.shopify_order_number,
    background_color: formatColor(badge.backgroundColor),
    // Line 1 (index 0)
    line_1_text: lines[0]?.text,
    line_1_font: lines[0]?.fontFamily,
    line_1_font_size: calculateFontSize(lines[0] || {}, badge.templateId),
    line_1_bold: lines[0]?.bold ?? false,
    line_1_underline: lines[0]?.underline ?? false,
    line_1_italicize: lines[0]?.italic ?? false,
    line_1_color: formatColor(lines[0]?.color),
    line_1_alignment: lines[0]?.align,
    // Line 2 (index 1)
    line_2_text: lines[1]?.text,
    line_2_font: lines[1]?.fontFamily,
    line_2_font_size: calculateFontSize(lines[1] || {}, badge.templateId),
    line_2_bold: lines[1]?.bold ?? false,
    line_2_underline: lines[1]?.underline ?? false,
    line_2_italicize: lines[1]?.italic ?? false,
    line_2_color: formatColor(lines[1]?.color),
    line_2_alignment: lines[1]?.align,
    // Line 3 (index 2)
    line_3_text: lines[2]?.text,
    line_3_font: lines[2]?.fontFamily,
    line_3_font_size: calculateFontSize(lines[2] || {}, badge.templateId),
    line_3_bold: lines[2]?.bold ?? false,
    line_3_underline: lines[2]?.underline ?? false,
    line_3_italicize: lines[2]?.italic ?? false,
    line_3_color: formatColor(lines[2]?.color),
    line_3_alignment: lines[2]?.align,
    // Line 4 (index 3)
    line_4_text: lines[3]?.text,
    line_4_font: lines[3]?.fontFamily,
    line_4_font_size: calculateFontSize(lines[3] || {}, badge.templateId),
    line_4_bold: lines[3]?.bold ?? false,
    line_4_underline: lines[3]?.underline ?? false,
    line_4_italicize: lines[3]?.italic ?? false,
    line_4_color: formatColor(lines[3]?.color),
    line_4_alignment: lines[3]?.align,
    thumbnail_url: options?.thumbnail_url,
    full_image_url: options?.full_image_url,
    pdf_url: options?.pdf_url,
    shopify_customer_id: options?.shopify_customer_id,
  }
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
      badge_id: item.badge_id,
      shopify_order_id: item.shopify_order_id,
      shopify_order_number: item.shopify_order_number,
      background_color: item.background_color,
      line_1_text: item.line_1_text,
      line_1_font: item.line_1_font,
      line_1_font_size: item.line_1_font_size,
      line_1_bold: item.line_1_bold,
      line_1_underline: item.line_1_underline,
      line_1_italicize: item.line_1_italicize,
      line_1_color: item.line_1_color,
      line_1_alignment: item.line_1_alignment,
      line_2_text: item.line_2_text,
      line_2_font: item.line_2_font,
      line_2_font_size: item.line_2_font_size,
      line_2_bold: item.line_2_bold,
      line_2_underline: item.line_2_underline,
      line_2_italicize: item.line_2_italicize,
      line_2_color: item.line_2_color,
      line_2_alignment: item.line_2_alignment,
      line_3_text: item.line_3_text,
      line_3_font: item.line_3_font,
      line_3_font_size: item.line_3_font_size,
      line_3_bold: item.line_3_bold,
      line_3_underline: item.line_3_underline,
      line_3_italicize: item.line_3_italicize,
      line_3_color: item.line_3_color,
      line_3_alignment: item.line_3_alignment,
      line_4_text: item.line_4_text,
      line_4_font: item.line_4_font,
      line_4_font_size: item.line_4_font_size,
      line_4_bold: item.line_4_bold,
      line_4_underline: item.line_4_underline,
      line_4_italicize: item.line_4_italicize,
      line_4_color: item.line_4_color,
      line_4_alignment: item.line_4_alignment,
      thumbnail_url: item.thumbnail_url,
      full_image_url: item.full_image_url,
      pdf_url: item.pdf_url,
      shopify_customer_id: item.shopify_customer_id,
      created_at: item.created_at || getPacificTimestamp(),
      updated_at: getPacificTimestamp()
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
    badge_id: item.badge_id,
    shopify_order_id: item.shopify_order_id,
    shopify_order_number: item.shopify_order_number,
    background_color: item.background_color,
    line_1_text: item.line_1_text,
    line_1_font: item.line_1_font,
    line_1_font_size: item.line_1_font_size,
    line_1_bold: item.line_1_bold,
    line_1_underline: item.line_1_underline,
    line_1_italicize: item.line_1_italicize,
    line_1_color: item.line_1_color,
    line_1_alignment: item.line_1_alignment,
    line_2_text: item.line_2_text,
    line_2_font: item.line_2_font,
    line_2_font_size: item.line_2_font_size,
    line_2_bold: item.line_2_bold,
    line_2_underline: item.line_2_underline,
    line_2_italicize: item.line_2_italicize,
    line_2_color: item.line_2_color,
    line_2_alignment: item.line_2_alignment,
    line_3_text: item.line_3_text,
    line_3_font: item.line_3_font,
    line_3_font_size: item.line_3_font_size,
    line_3_bold: item.line_3_bold,
    line_3_underline: item.line_3_underline,
    line_3_italicize: item.line_3_italicize,
    line_3_color: item.line_3_color,
    line_3_alignment: item.line_3_alignment,
    line_4_text: item.line_4_text,
    line_4_font: item.line_4_font,
    line_4_font_size: item.line_4_font_size,
    line_4_bold: item.line_4_bold,
    line_4_underline: item.line_4_underline,
    line_4_italicize: item.line_4_italicize,
    line_4_color: item.line_4_color,
    line_4_alignment: item.line_4_alignment,
    thumbnail_url: item.thumbnail_url,
    full_image_url: item.full_image_url,
    pdf_url: item.pdf_url,
    shopify_customer_id: item.shopify_customer_id,
    created_at: item.created_at || getPacificTimestamp(),
    updated_at: getPacificTimestamp()
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

// Update badge_order_items with shopify_order_id and shopify_order_number by design_id (for link-order flow from Gadget)
export async function updateBadgeOrderItemsByDesignIds(
  designIds: string[],
  shopifyOrderId: string,
  shopifyOrderNumber?: string | null
) {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.')
  }
  if (!designIds.length) {
    return { data: [], error: null }
  }
  const payload: Record<string, unknown> = {
    shopify_order_id: shopifyOrderId,
    updated_at: getPacificTimestamp()
  }
  if (shopifyOrderNumber != null && shopifyOrderNumber !== '') {
    payload.shopify_order_number = shopifyOrderNumber
  }
  const { data, error } = await supabaseAdmin
    .from('badge_order_items')
    .update(payload)
    .in('design_id', designIds)
    .select()
  if (error) {
    console.error('Update badge order items by design_ids error:', error)
    throw error
  }
  return { data, error: null }
} 