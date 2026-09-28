# Deliver Mtaani

Private delivery-operations workspace for one Shopify merchant.

## Stack

- React + Vite
- Express + Node.js
- Supabase PostgreSQL + Auth + Storage
- TomTom server-side search/routing
- Shopify integration when merchant access is available
- Render Web Service

Shopify remains the commerce system; Deliver Mtaani remains the delivery-operations system.

## Roles

- **Admin** — full operational access
- **Dispatcher** — delivery operations and rider assignment
- **Rider** — assigned delivery workflow on mobile/PWA

Customers remain Shopify customers and do not create Deliver Mtaani accounts.

## Project structure

```text
src/
  App.jsx
  main.js
  lib/
    api.js
    supabase.js
server/
  index.js
  app.js
  domain.js
sql/
  schema.sql
tests/
  domain.test.js
  project.test.js
docs/
  ARCHITECTURE.md
  DEPLOYMENT.md
public/
  logo.png
  favicon.svg
  site.webmanifest
```

## Local development

```bash
npm install
npm run dev
```

For the production-style server:

```bash
npm run build
npm start
```

Tests:

```bash
npm test
```

## Render

This project is a single Render Web Service. Render builds the Vite frontend, then Express serves the resulting `dist/` directory and `/api/*` routes.

Build:

```text
npm install --include=dev && npm run build
```

Start:

```text
npm start
```

Health check:

```text
/health
```

Render requires public web services to listen on `0.0.0.0` and the provided `PORT`; the project follows that requirement. 

## Environment variables

See `.env.example` for the complete list. Private credentials belong only in Render's Environment settings. In particular, never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TOMTOM_API_KEY`
- `SHOPIFY_ACCESS_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `INTERNAL_SYNC_SECRET`

## Shopify disconnected mode

The application is intentionally deployable before the merchant's Shopify account is available. Keep `VITE_SHOPIFY_ENABLED=false` until the correct Shopify app/authentication flow is established.

## Security model

- Supabase Auth session verification occurs server-side.
- Server-side role checks protect operational mutations.
- RLS protects browser reads.
- Rider mutations are restricted to their assigned delivery.
- Delivery state transitions are centralized and validated.
- Assignment updates use the previous database status to reduce race conditions.
- Shopify webhooks require HMAC verification.
- TomTom credentials never reach the browser.
- API errors avoid exposing internal details in production.
- API responses are not cached.
- Security headers are set by Express.

## UI principles

The interface uses the supplied Deliver Mtaani branding, SVG icons and a branded splash screen. Operational pages use live Supabase data and honest empty/loading/error states instead of fabricated production metrics.
