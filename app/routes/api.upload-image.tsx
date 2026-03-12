import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from '@gadget-client/allqualitybadges';
import { parseOr400, uploadImageBodySchema } from '~/utils/validation';

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(uploadImageBodySchema, body, 'Invalid request body');
    if (!parsed.ok) return parsed.response;
    const { imageData, filename, contentType, metadata } = parsed.data;

    console.log('Received image upload request:', { 
      hasImageData: !!imageData, 
      filename,
      contentType,
      metadataKeys: metadata ? Object.keys(metadata) : []
    });

    // Get environment variables
    const GADGET_API_URL = process.env.GADGET_API_URL || 'https://all-quality-badge-designer--development.gadget.app';
    const GADGET_API_KEY = process.env.GADGET_API_KEY;

    if (!GADGET_API_KEY) {
      return json({ error: "Gadget API key not configured" }, { status: 500 });
    }

    // Extract environment name from URL
    const getEnvironmentFromUrl = (url: string): string => {
      if (url.includes('--development')) return 'development';
      if (url.includes('--staging')) return 'staging';
      if (url.includes('--production') || (url.includes('all-quality-badge-designer.gadget.app') && !url.includes('--'))) return 'production';
      return 'development';
    };

    const environment = getEnvironmentFromUrl(GADGET_API_URL);

    // Create Gadget client
    const gadgetClient = new Client({
      environment: environment,
      authenticationMode: { apiKey: GADGET_API_KEY },
    });

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    console.log('Uploading image to Gadget:', {
      filename,
      contentType,
      bufferSize: buffer.length,
      metadata
    });

    // Get a direct upload token from Gadget
    const { url: uploadUrl, token } = await gadgetClient.getDirectUploadToken();

    console.log('Got direct upload token:', { uploadUrl, token });

    // Upload the file directly to cloud storage
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: buffer,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString()
      }
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log('File uploaded to cloud storage successfully');

    // Now we need to create a file record in Gadget using the token
    // For now, we'll return the upload URL and token
    // The actual file record creation can be done when saving the badge design

    return json({
      success: true,
      uploadUrl,
      token,
      filename
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    return json({ 
      error: "Failed to upload image",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}; 