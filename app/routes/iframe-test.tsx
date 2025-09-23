import type { LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = async () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Iframe Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .success { color: green; font-size: 24px; }
          .time { color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="success">✅ Iframe headers are working!</div>
        <p>If you can see this page in an iframe, the X-Frame-Options and CSP headers are set correctly.</p>
        <div class="time">Current time: ${new Date().toISOString()}</div>
      </body>
    </html>
  `;
  
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}; 