import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  console.log('Test API route - Loader function called');
  
  return json({
    success: true,
    message: "Test API route is working",
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url
  });
}; 