# Badge Designer Frontend

A standalone React/Remix application for designing custom badges, hosted on Vercel and embedded in Shopify product pages.

## Architecture

- **Frontend**: React/Remix app hosted on Vercel
- **Backend**: Gadget.dev API for data persistence
- **Integration**: Embedded in Shopify via iframe

## Development

```bash
npm install
npm run dev
```

## Deployment to Vercel

### Option 1: Vercel CLI (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel --prod
```

### Option 2: GitHub Integration

1. Push your code to GitHub
2. Connect your GitHub repo to Vercel
3. Vercel will auto-deploy on push

## Environment Variables

Set these in your Vercel project (Settings → Environment Variables). See `.env.example` for a full list.

**Required for badge designer + cart:**
- `NODE_ENV=production`
- `GADGET_API_URL` – Your Gadget app API URL (e.g. `https://allqualitybadges-development.gadget.app`)
- `GADGET_API_KEY` – Gadget API key for server-side create/update of badge designs
- `SHOPIFY_STORE_URL` – Shopify store hostname (e.g. `your-store.myshopify.com`), used when adding to cart from the app

**Required for “Send to Supabase” and checkout → Supabase flow:**
- `SUPABASE_URL` – Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key (server-only; used by link-order API)
- `LINK_ORDER_SECRET` – Shared secret for Gadget → Vercel `api/link-order-to-supabase` (e.g. `openssl rand -hex 32`). Set the same value in Gadget.

## Shopify Integration

Update your Shopify extension to use the Vercel URL:

```javascript
// In badge-designer-modal.js
const badgeDesignerUrl = `https://your-vercel-domain.vercel.app/?product=${productId}`;
```

## Features

- ✅ Badge design interface
- ✅ Real-time preview
- ✅ Shopify cart integration
- ✅ Iframe-friendly headers
- ✅ API integration with Gadget backend

## API Integration

The app communicates with your Gadget backend via:

- `POST /api/badge-designs` - Save designs
- `GET /api/badge-designs/:id` - Load designs
- `GET /api/products/:id` - Get product info

## Next Steps

1. Deploy to Vercel
2. Update Shopify extension URL
3. Test embedding in Shopify
4. Add more advanced features as needed

# Force deployment
