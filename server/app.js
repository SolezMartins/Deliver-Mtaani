import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { ASSIGNABLE_STATUSES, DELIVERY_TRANSITIONS, OPERATIONAL_ROLES, RIDER_TRANSITIONS, canTransition, isValidCoordinate } from './domain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

export const app = express();
app.disable('x-powered-by');

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const db = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function authenticate(req) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const token = header.slice(7).trim();
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication'), { status: 401 });
  return data.user;
}

async function roleOf(userId) {
  const { data, error } = await db().from('profiles').select('role,active').eq('id', userId).single();
  if (error || !data?.active) throw Object.assign(new Error('Operational account unavailable'), { status: 403 });
  return data.role;
}

async function operationalContext(req, allowedRoles = OPERATIONAL_ROLES) {
  const user = await authenticate(req);
  const role = await roleOf(user.id);
  if (!allowedRoles.has(role)) throw Object.assign(new Error('Permission denied'), { status: 403 });
  return { user, role };
}

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : (error?.message || 'Unexpected error');
  return res.status(status).json({ error: safeMessage });
}

function sendJson(res, status, body) { return res.status(status).json(body); }

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.post('/api/shopify-webhook', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  try {
    const secret = required('SHOPIFY_WEBHOOK_SECRET');
    const hmac = req.header('x-shopify-hmac-sha256');
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const digest = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    const expected = Buffer.from(digest);
    const provided = Buffer.from(hmac || '');
    if (!hmac || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return sendJson(res, 401, { error: 'Invalid HMAC' });

    const eventId = req.header('x-shopify-webhook-id');
    if (!eventId) return sendJson(res, 400, { error: 'Missing Shopify webhook id' });
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }

    const { error } = await db().from('webhook_events').insert({
      shopify_event_id: eventId,
      topic: req.header('x-shopify-topic') || 'unknown',
      payload
    });
    if (error?.code === '23505') return sendJson(res, 200, { received: true, duplicate: true });
    if (error) throw error;
    return sendJson(res, 200, { received: true });
  } catch (error) { return sendError(res, error); }
});

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => sendJson(res, 200, { ok: true, service: 'deliver-mtaani', timestamp: new Date().toISOString() }));

app.post('/api/assign-delivery', async (req, res) => {
  try {
    const { user } = await operationalContext(req, new Set(['ADMIN', 'DISPATCHER']));
    const { deliveryId, riderId } = req.body || {};
    if (typeof deliveryId !== 'string' || typeof riderId !== 'string') return sendJson(res, 400, { error: 'deliveryId and riderId are required' });
    const client = db();
    const { data: rider, error: riderError } = await client.from('riders').select('id,profile_id,availability').eq('id', riderId).single();
    if (riderError || !rider) return sendJson(res, 404, { error: 'Rider not found' });
    if (rider.availability === 'OFFLINE') return sendJson(res, 409, { error: 'Rider is offline' });
    const { data: current, error: deliveryError } = await client.from('deliveries').select('status,rider_id').eq('id', deliveryId).single();
    if (deliveryError || !current) return sendJson(res, 404, { error: 'Delivery not found' });
    if (!ASSIGNABLE_STATUSES.has(current.status)) return sendJson(res, 409, { error: `Delivery cannot be assigned from ${current.status}` });

    // Conditional status update prevents two dispatchers from silently overwriting each other.
    const { data, error } = await client.from('deliveries')
      .update({ rider_id: riderId, status: 'ASSIGNED' })
      .eq('id', deliveryId)
      .eq('status', current.status)
      .select()
      .single();
    if (error) throw error;
    if (!data) return sendJson(res, 409, { error: 'Delivery changed before assignment completed' });

    await Promise.all([
      client.from('delivery_events').insert({ delivery_id: deliveryId, user_id: user.id, from_status: current.status, to_status: 'ASSIGNED', action: 'RIDER_ASSIGNED', metadata: { riderId } }),
      client.from('audit_logs').insert({ user_id: user.id, action: 'RIDER_ASSIGNED', resource_type: 'delivery', resource_id: deliveryId, metadata: { riderId } })
    ]);
    return sendJson(res, 200, { delivery: data });
  } catch (error) { return sendError(res, error); }
});

app.post('/api/update-status', async (req, res) => {
  try {
    const { user, role } = await operationalContext(req);
    const { deliveryId, status } = req.body || {};
    if (typeof deliveryId !== 'string' || typeof status !== 'string') return sendJson(res, 400, { error: 'deliveryId and status are required' });
    if (!Object.prototype.hasOwnProperty.call(DELIVERY_TRANSITIONS, status)) return sendJson(res, 400, { error: 'Unknown delivery status' });
    const client = db();
    const { data: old, error } = await client.from('deliveries').select('status,rider_id').eq('id', deliveryId).single();
    if (error || !old) return sendJson(res, 404, { error: 'Delivery not found' });
    if (!canTransition(old.status, status)) return sendJson(res, 409, { error: `Invalid transition ${old.status} -> ${status}` });

    if (role === 'RIDER') {
      if (!old.rider_id) return sendJson(res, 403, { error: 'Delivery is not assigned' });
      const { data: rider } = await client.from('riders').select('profile_id').eq('id', old.rider_id).single();
      if (rider?.profile_id !== user.id) return sendJson(res, 403, { error: 'Not assigned to this delivery' });
      if (!RIDER_TRANSITIONS.has(status)) return sendJson(res, 403, { error: 'Riders cannot perform this transition' });
    } else if (!['ADMIN', 'DISPATCHER'].includes(role)) return sendJson(res, 403, { error: 'Permission denied' });

    const { data, error: updateError } = await client.from('deliveries').update({ status }).eq('id', deliveryId).eq('status', old.status).select().single();
    if (updateError) throw updateError;
    if (!data) return sendJson(res, 409, { error: 'Delivery changed before this update could be applied' });

    await Promise.all([
      client.from('delivery_events').insert({ delivery_id: deliveryId, user_id: user.id, from_status: old.status, to_status: status, action: 'STATUS_CHANGED' }),
      client.from('audit_logs').insert({ user_id: user.id, action: 'STATUS_CHANGED', resource_type: 'delivery', resource_id: deliveryId, metadata: { from: old.status, to: status } })
    ]);
    return sendJson(res, 200, { delivery: data });
  } catch (error) { return sendError(res, error); }
});

app.get('/api/tomtom-search', async (req, res) => {
  try {
    await operationalContext(req);
    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 160) return sendJson(res, 400, { error: 'Search text must contain 2–160 characters' });
    const key = required('TOMTOM_API_KEY');
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&countrySet=KE&limit=8`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    return sendJson(res, response.status, payload);
  } catch (error) { return sendError(res, error); }
});

app.post('/api/tomtom-route', async (req, res) => {
  try {
    await operationalContext(req);
    const { from, to } = req.body || {};
    if (!isValidCoordinate(from) || !isValidCoordinate(to)) return sendJson(res, 400, { error: 'Valid coordinates are required' });
    const key = required('TOMTOM_API_KEY');
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${encodeURIComponent(from.lat)},${encodeURIComponent(from.lng)}:${encodeURIComponent(to.lat)},${encodeURIComponent(to.lng)}/json?key=${encodeURIComponent(key)}&traffic=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    return sendJson(res, response.status, payload);
  } catch (error) { return sendError(res, error); }
});

app.post('/api/shopify-sync', async (req, res) => {
  try {
    const secret = required('INTERNAL_SYNC_SECRET');
    if (req.header('x-internal-secret') !== secret) return sendJson(res, 401, { error: 'Unauthorized' });
    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2026-07';
    if (!shop || !token) return sendJson(res, 503, { error: 'Shopify is not configured' });
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return sendJson(res, 400, { error: 'Invalid Shopify shop domain' });

    const query = `query Orders($first:Int!){orders(first:$first,sortKey:CREATED_AT,reverse:true){nodes{id name createdAt totalPriceSet{shopMoney{amount currencyCode}} customer{displayName defaultPhone} shippingAddress{address1 address2 city province country zip}}}}`;
    const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables: { first: 50 } }), signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json();
    if (!response.ok || payload.errors) return sendJson(res, 502, { error: 'Shopify request failed' });

    const client = db();
    const nodes = payload?.data?.orders?.nodes || [];
    for (const order of nodes) {
      const address = order.shippingAddress || {};
      const { error } = await client.from('deliveries').upsert({
        shopify_order_id: order.id,
        order_number: order.name,
        customer_name: order.customer?.displayName || 'Shopify customer',
        customer_phone: order.customer?.defaultPhone || '',
        order_value: Number(order.totalPriceSet?.shopMoney?.amount || 0),
        status: address.city ? 'NEW' : 'LOCATION_REQUIRED',
        county: address.province || '', city: address.city || '', street: address.address1 || '', instructions: address.address2 || ''
      }, { onConflict: 'shopify_order_id' });
      if (error) throw error;
    }
    return sendJson(res, 200, { synced: nodes.length });
  } catch (error) { return sendError(res, error); }
});

app.use(express.static(dist, { index: false, maxAge: '1h', etag: true }));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return sendJson(res, 404, { error: 'API route not found' });
  if (req.method !== 'GET') return next();
  return res.sendFile(path.join(dist, 'index.html'));
});

app.use((error, _req, res, _next) => sendError(res, error));
