import { json, type ActionFunctionArgs } from '@remix-run/node'
import { saveBadgeDesign, uploadToSupabase } from '~/utils/supabase'

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData()
    const designId = formData.get('designId') as string
    const designData = JSON.parse(formData.get('designData') as string)
    
    console.log('Supabase Update Badge - Received data:', {
      designId,
      productId: designData.productId,
      shopId: designData.shopId,
      hasThumbnail: !!formData.get('thumbnail'),
      hasFullImage: !!formData.get('fullImage')
    })
    
    // Upload images to Supabase Storage
    let thumbnailUrl = ''
    let fullImageUrl = ''
    
    const thumbnailFile = formData.get('thumbnail') as File
    const fullImageFile = formData.get('fullImage') as File
    
    if (thumbnailFile && thumbnailFile.size > 0) {
      try {
        thumbnailUrl = await uploadToSupabase(thumbnailFile, designId, 'thumbnail')
        console.log('Thumbnail uploaded:', thumbnailUrl)
      } catch (error) {
        console.error('Thumbnail upload failed:', error)
      }
    }
    
    if (fullImageFile && fullImageFile.size > 0) {
      try {
        fullImageUrl = await uploadToSupabase(fullImageFile, designId, 'full')
        console.log('Full image uploaded:', fullImageUrl)
      } catch (error) {
        console.error('Full image upload failed:', error)
      }
    }
    
    // Save to Supabase database
    const badgeDesign = {
      design_id: designId,
      product_id: designData.productId,
      shop_id: designData.shopId,
      user_id: designData.userId || 'anonymous',
      background_color: designData.backgroundColor,
      backing_price: designData.backingPrice || 0,
      backing_type: designData.backingType,
      base_price: designData.basePrice || 9.99,
      total_price: designData.totalPrice,
      design_data: designData,
      text_lines: designData.textLines,
      thumbnail_url: thumbnailUrl,
      full_image_url: fullImageUrl,
      status: 'saved' as const
    }
    
    const savedDesign = await saveBadgeDesign(badgeDesign)
    
    console.log('Badge design saved to Supabase:', {
      id: savedDesign.id,
      designId: savedDesign.design_id,
      thumbnailUrl: savedDesign.thumbnail_url,
      fullImageUrl: savedDesign.full_image_url
    })
    
    return json({ 
      success: true, 
      data: savedDesign,
      message: 'Badge design saved successfully to Supabase'
    })
    
  } catch (error) {
    console.error('Supabase update badge error:', error)
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to save badge design to Supabase'
    }, { status: 500 })
  }
} 