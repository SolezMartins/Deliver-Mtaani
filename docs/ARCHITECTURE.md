# Deliver Mtaani Architecture

## Runtime

Deliver Mtaani runs as one Render Web Service:

- Vite builds the React application into `dist/`.
- Express serves `dist/` and exposes the `/api/*` server boundary.
- Render supplies `PORT`; the Node process binds to `0.0.0.0`.
- `/health` is a lightweight readiness endpoint.

## Data and identity

Supabase provides PostgreSQL, Auth and Storage. The browser uses the Supabase publishable/anon key. The Render server uses the service-role/secret key only for controlled server-side operations.

Operational roles are `ADMIN`, `DISPATCHER`, and `RIDER`. Customers do not receive Deliver Mtaani accounts.

## Security boundary

Browser:
- Supabase session
- publishable/anon key
- read-only access governed by RLS

Render:
- service-role/secret key
- TomTom credential
- Shopify credentials
- webhook verification
- delivery assignment/status mutations

The browser never receives private Shopify, TomTom server, or Supabase service-role credentials.

## Delivery state machine

The state machine is centralized in `server/domain.js` and enforced by the API. Updates use the previous status in the database update condition to reduce race-condition risk when multiple operators act on the same delivery.

## External systems

- Shopify remains the commerce source of truth.
- TomTom provides search and routing through the server API.
- Supabase stores operational state.
- Render hosts the application runtime.

## Scalability

The API is stateless. Persistent operational state belongs in Supabase, so the Render service can be restarted or scaled without losing application state. Future realtime updates can use Supabase Realtime without changing the deployment boundary.
