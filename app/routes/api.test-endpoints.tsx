import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  console.log('Test endpoints - Loader function called');
  
  const testResults = [];
  
  // Test 1: Check if the badgeDesigns endpoint exists
  try {
    console.log('Testing badgeDesigns endpoint...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/badgeDesigns", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    testResults.push({
      endpoint: "/api/badgeDesigns",
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/badgeDesigns",
      method: "GET",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Test 2: Check if the badge-designs endpoint exists (with hyphen)
  try {
    console.log('Testing badge-designs endpoint...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/badge-designs", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    testResults.push({
      endpoint: "/api/badge-designs",
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/badge-designs",
      method: "GET",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Test 3: Check GraphQL endpoint
  try {
    console.log('Testing GraphQL endpoint...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query {
            __schema {
              types {
                name
              }
            }
          }
        `
      }),
    });
    
    testResults.push({
      endpoint: "/api/graphql",
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/graphql",
      method: "POST",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Test 4: Check if there's a public API endpoint
  try {
    console.log('Testing public API endpoint...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/public/badgeDesigns", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    testResults.push({
      endpoint: "/api/public/badgeDesigns",
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/public/badgeDesigns",
      method: "GET",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Test 5: Check if there's a different endpoint structure
  try {
    console.log('Testing badgeDesign endpoint (singular)...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/badgeDesign", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    testResults.push({
      endpoint: "/api/badgeDesign",
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/badgeDesign",
      method: "GET",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Test 6: Check if there's a REST API endpoint
  try {
    console.log('Testing REST API endpoint...');
    const response = await fetch("https://allqualitybadges.gadget.app/api/rest/badgeDesigns", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    testResults.push({
      endpoint: "/api/rest/badgeDesigns",
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      success: response.ok
    });
  } catch (error) {
    testResults.push({
      endpoint: "/api/rest/badgeDesigns",
      method: "GET",
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  console.log('Test results:', testResults);
  
  return json({
    success: true,
    testResults,
    message: "Endpoint tests completed"
  });
}; 