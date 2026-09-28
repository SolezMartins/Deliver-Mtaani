# Render + Supabase Deployment

## 1. Supabase

1. Create a Supabase project.
2. Run `sql/schema.sql` in the SQL Editor.
3. Enable email/password Auth for operational users.
4. Create Admin, Dispatcher and Rider profiles that correspond to Auth users.
5. Create private Storage buckets when delivery proof uploads are enabled.

## 2. Environment variables

Set the variables listed in `.env.example` in the Render service. Render supports adding them individually or importing a `.env` file through the Environment page. Never commit real secrets. Render environment variables are available at build/runtime according to their configuration. 

## 3. Render

Create a **Web Service** from the project repository or a public repository URL.

- Runtime: Node
- Node Version: `20.19.5`
- Build: `npm install --include=dev && npm run build`
- Start: `npm start`
- Health check: `/health`

The server binds to `0.0.0.0` and Render's `PORT`.

## 4. Shopify

Keep `VITE_SHOPIFY_ENABLED=false` until the merchant's Shopify store/app access is available. Do not request the merchant's Shopify password. Configure the correct app authentication flow once the store owner provides app access.

The webhook URL is:

`https://YOUR-SERVICE.onrender.com/api/shopify-webhook`

The endpoint verifies the Shopify HMAC before storing a webhook event.

## 5. Verification checklist

- `/health` returns HTTP 200.
- Login works with a Supabase Auth user.
- Profile role loads correctly.
- Deliveries and riders are visible according to RLS.
- Assignment rejects offline riders and stale delivery states.
- Rider status updates are restricted to the assigned rider.
- TomTom route/search requests work only for authenticated operational users.
- Shopify remains disconnected until credentials are intentionally configured.
- No secret appears in browser source or `VITE_*` variables.
