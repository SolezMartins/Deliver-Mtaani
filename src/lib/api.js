import { supabase } from './supabase';

async function bearerHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  return { ...extra, Authorization: `Bearer ${session.access_token}` };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || 'Request failed');
  return payload;
}

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getProfile() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

export async function listDeliveries() {
  const { data, error } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listRiders() {
  const { data, error } = await supabase.from('riders').select('id,name,phone,availability,lat,lng').order('name');
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, status: r.availability, deliveries: 0 }));
}

export async function listZones() {
  const { data, error } = await supabase.from('delivery_zones').select('id,name,coverage,fee,active').order('name');
  if (error) throw error;
  return data || [];
}

export async function listAuditLogs() {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,action,resource_type,resource_id,metadata,created_at,user_id')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function assignDelivery(id, riderId) {
  return apiRequest('/api/assign-delivery', {
    method: 'POST',
    headers: await bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deliveryId: id, riderId })
  });
}

export async function updateDeliveryStatus(id, status) {
  return apiRequest('/api/update-status', {
    method: 'POST',
    headers: await bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deliveryId: id, status })
  });
}

export async function tomtomSearch(q) {
  return apiRequest(`/api/tomtom-search?q=${encodeURIComponent(q)}`, {
    headers: await bearerHeaders()
  });
}

export async function tomtomRoute(from, to) {
  return apiRequest('/api/tomtom-route', {
    method: 'POST',
    headers: await bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ from, to })
  });
}
