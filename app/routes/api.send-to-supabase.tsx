import { json, type ActionFunctionArgs } from '@remix-run/node'
import { uploadToBadgePdfsBucket, saveBadgeOrderItems } from '~/utils/supabase'

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData()
    
    const designId = formData.get('designId') as string
    const designData = JSON.parse(formData.get('designData') as string)
    const shopifyCustomerId = formData.get('shopifyCustomerId') as string || null
    
    console.log('Send to Supabase - Received data:', {
      designId,
      hasPdf: !!formData.get('pdf'),
      hasSvg: !!formData.get('svg'),
      hasPng: !!formData.get('png'),
      shopifyCustomerId
    })
    
    // Upload files to badge_pdfs bucket
    let pdfUrl = ''
    let svgUrl = ''
    
    const pdfFile = formData.get('pdf') as File
    const svgFile = formData.get('svg') as File
    const pngFile = formData.get('png') as File
    
    // Upload PDF (shared across all badges)
    if (pdfFile && pdfFile.size > 0) {
      try {
        const pdfFileName = `${designId}/badge-design.pdf`
        pdfUrl = await uploadToBadgePdfsBucket(pdfFile, pdfFileName, 'application/pdf')
        console.log('PDF uploaded successfully:', pdfUrl)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('PDF upload failed:', errorMessage)
        console.error('Full error:', error)
      }
    } else {
      console.warn('PDF file is missing or empty')
    }
    
    // Upload SVG (shared across all badges)
    if (svgFile && svgFile.size > 0) {
      try {
        const svgFileName = `${designId}/badge-design.svg`
        svgUrl = await uploadToBadgePdfsBucket(svgFile, svgFileName, 'image/svg+xml')
        console.log('SVG uploaded successfully:', svgUrl)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('SVG upload failed:', errorMessage)
        console.error('Full error:', error)
      }
    } else {
      console.warn('SVG file is missing or empty')
    }
    
    // Get all badges from design data
    const allBadges = designData.allBadges || [designData.badge]
    
    // Upload files for each badge and prepare order items
    const badgeOrderItems = []
    
    for (let badgeIndex = 0; badgeIndex < allBadges.length; badgeIndex++) {
      const badge = allBadges[badgeIndex]
      
      // Upload PNG for this specific badge
      // Note: Currently we only have one PNG file, so we'll use it for the first badge
      // For multiple badges, you'd need to generate separate PNGs for each
      let badgeThumbnailUrl = ''
      let badgeFullImageUrl = ''
      
      if (pngFile && pngFile.size > 0) {
        try {
          // Upload PNG - use badge index in filename to allow for multiple badges later
          const pngFileName = `${designId}/badge-${badgeIndex}-design.png`
          badgeFullImageUrl = await uploadToBadgePdfsBucket(pngFile, pngFileName, 'image/png')
          console.log(`PNG uploaded successfully for badge ${badgeIndex}:`, badgeFullImageUrl)
          
          // For now, use the same PNG as thumbnail (you can optimize this later)
          badgeThumbnailUrl = badgeFullImageUrl
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`PNG upload failed for badge ${badgeIndex}:`, errorMessage)
          console.error('Full error:', error)
        }
      } else {
        console.warn(`PNG file is missing or empty for badge ${badgeIndex}`)
      }
      
      // Create badge order item
      const badgeOrderItem = {
        design_id: designId,
        badge_index: badgeIndex,
        badge_id: badge.id || `badge-${badgeIndex}`,
        badge_data: badge, // Full badge design data
        thumbnail_url: badgeThumbnailUrl,
        full_image_url: badgeFullImageUrl,
        pdf_url: pdfUrl, // Same PDF for all badges (contains all badges)
        shopify_customer_id: shopifyCustomerId
      }
      
      badgeOrderItems.push(badgeOrderItem)
    }
    
    // Save all badge order items to database
    let savedItems = null
    try {
      savedItems = await saveBadgeOrderItems(badgeOrderItems)
      console.log(`Saved ${savedItems?.length || 0} badge order items to Supabase:`, {
        designId,
        badgeCount: savedItems?.length || 0,
        pdfUrl,
        thumbnailUrl: savedItems?.[0]?.thumbnail_url,
        fullImageUrl: savedItems?.[0]?.full_image_url
      })
    } catch (error) {
      console.error('Save badge order items error:', error)
      // Continue even if database save fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('fetch failed')) {
        return json({ 
          success: false, 
          error: 'Cannot connect to Supabase. Please check your network connection and Supabase configuration.',
          message: 'Supabase connection failed. Files were generated but could not be uploaded.',
          warning: true
        }, { status: 503 })
      }
      throw error
    }
    
    // Check if any uploads succeeded
    const hasAnyUploads = pdfUrl || svgUrl || (savedItems && savedItems.length > 0 && savedItems[0].full_image_url)
    if (!hasAnyUploads && !savedItems) {
      return json({ 
        success: false, 
        error: 'All uploads failed. Please check your Supabase configuration and network connection.',
        message: 'Failed to upload files to Supabase storage'
      }, { status: 503 })
    }
    
    const badgeCount = savedItems?.length || 0
    const hasPng = savedItems && savedItems.length > 0 && !!savedItems[0].full_image_url
    
    return json({ 
      success: true, 
      data: savedItems,
      badgeCount,
      uploads: {
        pdf: !!pdfUrl,
        svg: !!svgUrl,
        png: hasPng
      },
      message: hasAnyUploads 
        ? `Badge design uploaded successfully to Supabase (${badgeCount} badge${badgeCount !== 1 ? 's' : ''} saved)` 
        : 'Badge design saved to database (file uploads failed)'
    })
    
  } catch (error) {
    console.error('Send to Supabase error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Check if it's a network/connection error
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('fetch failed')) {
      return json({ 
        success: false, 
        error: 'Cannot connect to Supabase. Please check your network connection and Supabase configuration.',
        message: 'Supabase connection failed'
      }, { status: 503 })
    }
    
    return json({ 
      success: false, 
      error: errorMessage,
      message: 'Failed to upload badge design to Supabase'
    }, { status: 500 })
  }
}
