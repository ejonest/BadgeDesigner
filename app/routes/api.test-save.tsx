import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  console.log('Test save - Loader function called');
  
  try {
    // Use the exact same payload that worked in the playground
    const gadgetUrl = "https://allqualitybadges.gadget.app/api/graphql";
    console.log('Test save - Calling Gadget GraphQL URL:', gadgetUrl);
    
    const graphqlQuery = `
      mutation CreateBadgeDesign($badgeDesign: CreateBadgeDesignInput!) {
        createBadgeDesign(badgeDesign: $badgeDesign) {
          success
          errors {
            message
            code
          }
          badgeDesign {
            id
            designId
            shopId
            status
          }
        }
      }
    `;
    
    // Use the exact same payload that worked in the playground
    const testPayload = {
      shopId: "badgesonly.myshopify.com",
      productId: "the-multi-managed-snowboard",
      designId: `design_test_${Date.now()}`,
      status: "saved",
      designData: {
        lines: [
          {
            text: "Your Name",
            size: 18,
            color: "#000000",
            bold: false,
            italic: false,
            underline: false,
            fontFamily: "Arial",
            alignment: "center"
          }
        ],
        backgroundColor: "#FFFFFF",
        backing: "pin"
      },
      backgroundColor: "#FFFFFF",
      backingType: "pin",
      basePrice: 9.99,
      backingPrice: 0,
      totalPrice: 9.99,
      textLines: [
        {
          text: "Your Name",
          size: 18,
          color: "#000000",
          bold: false,
          italic: false,
          underline: false,
          fontFamily: "Arial",
          alignment: "center"
        }
      ]
    };
    
    const graphqlPayload = {
      query: graphqlQuery,
      variables: {
        badgeDesign: testPayload
      }
    };
    
    console.log('Test save - GraphQL payload:', JSON.stringify(graphqlPayload, null, 2));
    
    const response = await fetch(gadgetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(graphqlPayload),
    });

    console.log('Test save - Gadget response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Test save - Gadget API error response:', errorText);
      throw new Error(`Gadget API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Test save - Gadget response:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('Test save - GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }
    
    console.log('Test save - Checking success field:', result.data?.createBadgeDesign?.success);
    console.log('Test save - Full createBadgeDesign result:', result.data?.createBadgeDesign);
    
    if (!result.data?.createBadgeDesign?.success) {
      const errors = result.data?.createBadgeDesign?.errors;
      console.error('Test save - Badge design creation failed with errors:', errors);
      throw new Error(`Badge design creation failed: ${JSON.stringify(errors)}`);
    }
    
    return json({
      success: true,
      result: result.data.createBadgeDesign,
      message: "Test save completed successfully"
    });
  } catch (error) {
    console.error("Test save - Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      error: error
    });
    return json({ 
      error: "Test save failed",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}; 