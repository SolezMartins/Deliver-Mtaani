# Render Setup — Deliver Mtaani

This repository is intentionally structured so `package.json` is at the repository root.

## Render Web Service settings

- Runtime: Node
- Node Version: `20.19.5`
- Root Directory: **leave completely blank**
- Build Command: `npm install --include=dev && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`
- Publish Directory: **leave blank**

Do not set Root Directory to `src`.

The repository root contains:

- `package.json`
- `render.yaml`
- `src/`
- `server/`
- `public/`

## Current environment variables

Required for the current deployment:

- `NODE_ENV=production`
- `VITE_SHOPIFY_ENABLED=false`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOMTOM_API_KEY`

Shopify is intentionally disabled until the merchant's Shopify access is available. Do not add Shopify credentials yet.

## Important

If the Render Dashboard still shows an old Root Directory such as `src`, clear it manually and save the service settings. If the service was created from an older Blueprint configuration, redeploy the latest repository commit after the settings are corrected.

## Current frontend entry point

The Vite entry point is `src/main.jsx`. The root `index.html` loads `/src/main.jsx`. `src/styles.css` is included because the entry file imports it.
