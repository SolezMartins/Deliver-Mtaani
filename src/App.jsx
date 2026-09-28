import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Truck, MapPinned, Users, BarChart3, Settings, LogOut, Menu, Search,
  Navigation, CheckCircle2, Clock3, AlertTriangle, Package, WalletCards, ShieldCheck,
  RefreshCw, X, LoaderCircle, MapPin, Activity, CircleAlert, Route as RouteIcon
} from 'lucide-react';
import { supabase } from './lib/supabase';
import {
  signIn, signOut, getProfile, listDeliveries, listRiders, listZones, listAuditLogs,
  assignDelivery, updateDeliveryStatus, tomtomRoute
} from './lib/api';

const ACTIVE_STATUSES = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'];
const NON_TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];
const ADMIN_ROLES = ['ADMIN'];
const OPS_ROLES = ['ADMIN', 'DISPATCHER'];

function useAuth() {
  const [state, setState] = useState({ user: null, profile: null, loading: true });
  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) return setState({ user: null, profile: null, loading: false });
      try {
        const profile = await getProfile();
        if (mounted) setState({ user: data.user, profile, loading: false });
      } catch {
        if (mounted) setState({ user: data.user, profile: null, loading: false });
      }
    }
    load();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) setState({ user: null, profile: null, loading: false });
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  return state;
}

function useData() {
  const [data, setData] = useState({ deliveries: [], riders: [], zones: [], audit: [], loading: true, error: '' });
  const refresh = async () => {
    setData((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [deliveries, riders, zones] = await Promise.all([listDeliveries(), listRiders(), listZones().catch(() => [])]);
      let audit = [];
      try { audit = await listAuditLogs(); } catch { /* audit is admin-only */ }
      setData({ deliveries, riders, zones, audit, loading: false, error: '' });
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error: error?.message || 'Unable to load operational data.' }));
    }
  };
  useEffect(() => { refresh(); }, []);
  return { ...data, refresh, setData };
}

function Splash() {
  return <div className="splash"><div className="splash-card">
    <img src="/logo.png" alt="Deliver Mtaani" />
    <div className="splash-copy"><strong>Deliver Mtaani</strong><span>Preparing your delivery workspace</span></div>
    <div className="splash-progress"><i /></div><LoaderCircle className="splash-spinner" size={18} />
  </div></div>;
}

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const result = await signIn(email, password);
    if (result.error) setError(result.error.message); else navigate('/');
    setBusy(false);
  }
  return <div className="login-shell"><div className="login-card">
    <img src="/logo.png" className="login-logo" alt="Deliver Mtaani" />
    <p className="eyebrow">DELIVERY OPERATIONS</p><h1>Welcome back</h1>
    <p className="muted">Sign in to your Deliver Mtaani workspace.</p>
    <form onSubmit={submit}>
      <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="admin@merchant.co.ke" /></label>
      <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="login-note"><ShieldCheck size={16} /> Customers stay in Shopify. Deliver Mtaani accounts are for Admin, Dispatcher and Rider users.</div>
  </div></div>;
}

function Status({ value }) {
  const label = String(value || 'UNKNOWN').replaceAll('_', ' ');
  return <span className={`pill ${String(value || '').toLowerCase()}`}>{label}</span>;
}

function Stat({ title, value, icon: Icon, sub }) {
  return <div className="stat card"><div className="stat-icon"><Icon size={19} /></div><div><span>{title}</span><strong>{value}</strong><small>{sub}</small></div></div>;
}

function DataNotice({ loading, error, onRetry }) {
  if (loading) return <div className="card data-notice"><LoaderCircle className="spin" size={20} /> Loading operational data…</div>;
  if (error) return <div className="card data-notice error-state"><CircleAlert size={20} /><span>{error}</span><button className="secondary" onClick={onRetry}>Retry</button></div>;
  return null;
}

function DeliveryTable({ deliveries, onAssign }) {
  if (!deliveries.length) return <div className="empty"><Package size={30} /><h3>No deliveries yet</h3><p>Shopify orders will appear here once the integration is connected.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Location</th><th>Status</th><th>Readiness</th><th>Rider</th></tr></thead><tbody>
    {deliveries.map((d) => <tr key={d.id}>
      <td><b>{d.order_number}</b><small>KSh {Number(d.order_value || 0).toLocaleString()}</small></td>
      <td>{d.customer_name}<small>{d.customer_phone || 'No phone'}</small></td>
      <td>{d.area || '—'}<small>{d.estate || d.city || 'Location required'}</small></td>
      <td><Status value={d.status} /></td>
      <td><div className="mini-progress"><i style={{ width: `${Number(d.readiness || 0)}%` }} /></div><small>{Number(d.readiness || 0)}%</small></td>
      <td>{d.rider_id ? 'Assigned' : onAssign ? <button className="small-btn" onClick={() => onAssign(d)}>Assign</button> : 'Unassigned'}</td>
    </tr>)}
  </tbody></table></div>;
}

function AppShell() {
  const location = useLocation(); const navigate = useNavigate(); const { profile } = useAuth(); const role = profile?.role || 'DISPATCHER';
  const [open, setOpen] = useState(true);
  const items = [
    ['/', 'Dashboard', LayoutDashboard, ['ADMIN', 'DISPATCHER']],
    ['/deliveries', 'Deliveries', Package, ['ADMIN', 'DISPATCHER']],
    ['/dispatch', 'Dispatch', Truck, OPS_ROLES],
    ['/map', 'Live map', MapPinned, ['ADMIN', 'DISPATCHER']],
    ['/riders', 'Riders', Users, OPS_ROLES],
    ['/zones', 'Zones & fees', WalletCards, ADMIN_ROLES],
    ['/analytics', 'Analytics', BarChart3, ['ADMIN', 'DISPATCHER']],
    ['/audit', 'Audit log', ShieldCheck, ADMIN_ROLES],
    ['/settings', 'Settings', Settings, ADMIN_ROLES]
  ].filter((item) => item[3].includes(role));
  return <div className="app"><aside className={open ? 'sidebar' : 'sidebar collapsed'}>
    <div className="brand"><img src="/logo.png" alt="" /><span>Deliver<br /><b>Mtaani</b></span></div>
    <button className="icon-btn side-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation"><Menu size={21} /></button>
    <nav>{items.map(([path, label, Icon]) => <button key={path} className={location.pathname === path ? 'nav active' : 'nav'} onClick={() => navigate(path)}><Icon size={19} /><span>{label}</span></button>)}</nav>
    <div className="side-bottom"><div className="user-mini"><div className="avatar">{(profile?.full_name || 'M')[0]}</div><div><b>{profile?.full_name || 'Operations user'}</b><small>{role}</small></div></div><button className="nav" onClick={() => signOut()}><LogOut size={18} /><span>Sign out</span></button></div>
  </aside><main className="main">
    <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setOpen(!open)} aria-label="Open navigation"><Menu /></button><div><span className="eyebrow">SHOPIFY → DELIVERY OPERATIONS</span><h2>{items.find((item) => item[0] === location.pathname)?.[1] || 'Dashboard'}</h2></div><div className="top-actions"><span className="status-dot"><i /> System operational</span><div className="avatar">{(profile?.full_name || 'M')[0]}</div></div></header>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/deliveries" element={<RoleRoute role={role} allowed={['ADMIN', 'DISPATCHER']}><Deliveries /></RoleRoute>} />
      <Route path="/dispatch" element={<RoleRoute role={role} allowed={OPS_ROLES}><Dispatch /></RoleRoute>} />
      <Route path="/map" element={<RoleRoute role={role} allowed={['ADMIN', 'DISPATCHER']}><LiveMap /></RoleRoute>} />
      <Route path="/riders" element={<RoleRoute role={role} allowed={OPS_ROLES}><Riders /></RoleRoute>} />
      <Route path="/zones" element={<RoleRoute role={role} allowed={ADMIN_ROLES}><Zones /></RoleRoute>} />
      <Route path="/analytics" element={<RoleRoute role={role} allowed={['ADMIN', 'DISPATCHER']}><Analytics /></RoleRoute>} />
      <Route path="/audit" element={<RoleRoute role={role} allowed={ADMIN_ROLES}><Audit /></RoleRoute>} />
      <Route path="/settings" element={<RoleRoute role={role} allowed={ADMIN_ROLES}><SettingsPage /></RoleRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </main></div>;
}

function RoleRoute({ role, allowed, children }) {
  return allowed.includes(role) ? children : <Navigate to="/" replace />;
}

function Dashboard() {
  const { deliveries, riders, loading, error, refresh } = useData();
  const counts = useMemo(() => ({
    ready: deliveries.filter((d) => ['READY_FOR_DISPATCH', 'LOCATION_CONFIRMED'].includes(d.status)).length,
    unassigned: deliveries.filter((d) => !d.rider_id && !NON_TERMINAL_STATUSES.includes(d.status)).length,
    active: deliveries.filter((d) => ACTIVE_STATUSES.includes(d.status)).length,
    failed: deliveries.filter((d) => ['DELIVERY_FAILED', 'CUSTOMER_UNAVAILABLE'].includes(d.status)).length
  }), [deliveries]);
  const readiness = Math.round(deliveries.reduce((sum, d) => sum + Number(d.readiness || 0), 0) / (deliveries.length || 1));
  return <div className="page"><div className="hero"><div><p className="eyebrow">TODAY · {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'short' })}</p><h1>Good afternoon.</h1><p>Keep the delivery floor moving from one place.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={18} /> Refresh data</button></div>
    <DataNotice loading={loading} error={error} onRetry={refresh} />
    <div className="stats"><Stat title="Ready to dispatch" value={counts.ready} icon={CheckCircle2} sub="Location confirmed" /><Stat title="Unassigned" value={counts.unassigned} icon={Clock3} sub="Needs a rider" /><Stat title="Active deliveries" value={counts.active} icon={Navigation} sub={`${riders.length} riders in roster`} /><Stat title="Exceptions" value={counts.failed} icon={AlertTriangle} sub="Needs attention" /></div>
    <div className="grid-2"><div className="card"><div className="card-head"><div><h3>Delivery queue</h3><p>Latest operational activity</p></div></div><DeliveryTable deliveries={deliveries.slice(0, 5)} /></div><div className="card readiness-card"><div className="card-head"><div><h3>Location readiness</h3><p>Can riders act on the address?</p></div></div><div className="readiness-ring"><div><strong>{readiness}%</strong><span>average</span></div></div><div className="legend"><span><i className="dot good" />Ready</span><span><i className="dot warn" />Needs detail</span><span><i className="dot bad" />Missing location</span></div></div></div>
  </div>;
}

function Deliveries() {
  const { deliveries, loading, error, refresh, riders } = useData(); const [query, setQuery] = useState(''); const [selected, setSelected] = useState(null);
  const filtered = deliveries.filter((d) => `${d.order_number} ${d.customer_name} ${d.area} ${d.estate}`.toLowerCase().includes(query.toLowerCase()));
  async function handleAssign(delivery) { setSelected(delivery); }
  return <div className="page"><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, customer or location" /></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div>
    <DataNotice loading={loading} error={error} onRetry={refresh} /><div className="card"><DeliveryTable deliveries={filtered} onAssign={handleAssign} /></div>
    {selected && <AssignmentModal delivery={selected} riders={riders} onClose={() => setSelected(null)} onAssigned={refresh} />}
  </div>;
}

function AssignmentModal({ delivery, riders, onClose, onAssigned }) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  async function assign(rider) {
    setBusy(rider.id); setError('');
    try { await assignDelivery(delivery.id, rider.id); await onAssigned(); onClose(); }
    catch (err) { setError(err.message || 'Assignment failed.'); }
    finally { setBusy(''); }
  }
  return <div className="overlay"><div className="modal"><button className="close" onClick={onClose} aria-label="Close"><X /></button><p className="eyebrow">ASSIGN DELIVERY</p><h2>{delivery.order_number} · {delivery.customer_name}</h2><p className="muted">{delivery.area || 'Location pending'}{delivery.estate ? `, ${delivery.estate}` : ''}</p>{error && <div className="error">{error}</div>}<div className="rider-options">
    {riders.filter((r) => r.status !== 'OFFLINE').map((rider) => <button key={rider.id} className="rider-option" disabled={Boolean(busy)} onClick={() => assign(rider)}><div className="avatar">{rider.name[0]}</div><div><b>{rider.name}</b><small>{rider.status}</small></div>{busy === rider.id ? <LoaderCircle className="spin" size={18} /> : <Navigation size={18} />}</button>)}
    {!riders.length && <div className="empty"><Users size={28} /><p>No rider accounts are available.</p></div>}
  </div></div></div>;
}

function Dispatch() {
  const { deliveries, riders, loading, error, refresh } = useData();
  const pending = deliveries.filter((d) => !d.rider_id && !NON_TERMINAL_STATUSES.includes(d.status));
  async function quickAssign(delivery) {
    const rider = riders.find((r) => r.status === 'AVAILABLE');
    if (!rider) return;
    try { await assignDelivery(delivery.id, rider.id); await refresh(); } catch { /* notice appears after refresh */ }
  }
  return <div className="page"><div className="toolbar"><div><h3>Dispatch board</h3><p className="muted">Allocate ready deliveries to available riders.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="dispatch-grid"><div className="card"><div className="card-head"><div><h3>Unassigned</h3><p>{pending.length} jobs need allocation</p></div></div>{pending.length ? pending.map((delivery) => <div className="job" key={delivery.id}><div><b>{delivery.order_number} · {delivery.customer_name}</b><span>{delivery.area || 'Area pending'} · {delivery.estate || 'location detail needed'}</span><Status value={delivery.status} /></div><button className="small-btn" disabled={!riders.some((r) => r.status === 'AVAILABLE')} onClick={() => quickAssign(delivery)}>Assign</button></div>) : <div className="empty"><CheckCircle2 size={30} /><h3>Dispatch queue is clear</h3><p>New unassigned deliveries will appear here.</p></div>}</div>
    <div className="card"><div className="card-head"><div><h3>Rider workload</h3><p>Current operational capacity</p></div></div>{riders.length ? riders.map((rider) => <div className="workload" key={rider.id}><div className="avatar">{rider.name[0]}</div><div className="grow"><b>{rider.name}</b><span>{rider.status}</span><div className="mini-progress"><i style={{ width: `${Math.min(Number(rider.deliveries || 0) * 6, 100)}%` }} /></div></div><strong>{rider.deliveries || 0}</strong></div>) : <div className="empty"><Users size={28} /><p>No riders configured.</p></div>}</div></div></div>;
}

function LiveMap() {
  const { deliveries, loading, error, refresh } = useData();
  const active = deliveries.filter((d) => ACTIVE_STATUSES.includes(d.status));
  return <div className="page"><div className="toolbar"><div><h3>Live delivery locations</h3><p className="muted">Operational location board backed by delivery GPS data.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="map-shell"><div className="fake-map"><div className="map-grid" /><div className="map-overlay"><b>TomTom location intelligence</b><span>{active.length} active deliveries with operational tracking data</span></div>{active.filter((d) => d.lat != null && d.lng != null).map((d, index) => <div key={d.id} className={`map-pin pin-${index % 3}`} style={{ left: `${20 + (index * 17) % 70}%`, top: `${22 + (index * 19) % 60}%` }}><div className="pin-label">{d.order_number}</div><MapPin size={25} /></div>)}</div><div className="map-side"><h3>Active deliveries</h3>{active.length ? active.map((d) => <div className="map-item" key={d.id}><span className="map-dot" /><div><b>{d.order_number}</b><small>{d.customer_name} · {d.area || 'Location pending'}</small></div><Status value={d.status} /></div>) : <div className="empty"><MapPinned size={28} /><p>No active deliveries.</p></div>}</div></div></div>;
}

function Riders() {
  const { riders, loading, error, refresh } = useData();
  return <div className="page"><div className="toolbar"><div><h3>Rider roster</h3><p className="muted">Operational rider accounts and availability.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="rider-grid">{riders.length ? riders.map((r) => <div className="card rider-card" key={r.id}><div className="rider-top"><div className="avatar big">{r.name[0]}</div><span className={`availability ${String(r.status).toLowerCase()}`}><i /> {r.status}</span></div><h3>{r.name}</h3><p>{r.phone || 'No phone number'}</p><div className="rider-stats"><span><b>{r.deliveries || 0}</b> deliveries</span><span><b>{r.lat != null && r.lng != null ? 'GPS' : '—'}</b> location</span></div></div>) : <div className="card empty"><Users size={32} /><h3>No rider accounts</h3><p>Create operational rider profiles in Supabase Auth and the riders table.</p></div>}</div></div>;
}

function Zones() {
  const { zones, loading, error, refresh } = useData();
  return <div className="page"><div className="toolbar"><div><h3>Zones & delivery fees</h3><p className="muted">Configured delivery coverage and pricing from Supabase.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="card"><table><thead><tr><th>Zone</th><th>Coverage</th><th>Pricing</th><th>Status</th></tr></thead><tbody>{zones.map((zone) => <tr key={zone.id}><td><b>{zone.name}</b></td><td>{zone.coverage || '—'}</td><td>KSh {Number(zone.fee || 0).toLocaleString()}</td><td><span className={`availability ${zone.active ? 'available' : 'offline'}`}><i /> {zone.active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table>{!zones.length && <div className="empty"><WalletCards size={30} /><h3>No delivery zones configured</h3><p>Zones are managed in Supabase until the admin management workflow is enabled.</p></div>}</div></div>;
}

function Analytics() {
  const { deliveries, loading, error, refresh } = useData();
  const metrics = useMemo(() => {
    const delivered = deliveries.filter((d) => d.status === 'DELIVERED').length;
    const failed = deliveries.filter((d) => ['DELIVERY_FAILED', 'CUSTOMER_UNAVAILABLE'].includes(d.status)).length;
    const completed = delivered + failed;
    const success = completed ? ((delivered / completed) * 100).toFixed(1) : '0.0';
    const areas = Object.entries(deliveries.reduce((acc, d) => { const area = d.area || 'Unknown'; acc[area] = (acc[area] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { delivered, success, areas };
  }, [deliveries]);
  return <div className="page"><div className="toolbar"><div><h3>Operational analytics</h3><p className="muted">Calculated from current delivery records; no placeholder figures.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="stats"><Stat title="Delivered" value={metrics.delivered} icon={CheckCircle2} sub="Current records" /><Stat title="Success rate" value={`${metrics.success}%`} icon={BarChart3} sub="Delivered vs exceptions" /><Stat title="Total deliveries" value={deliveries.length} icon={Package} sub="All operational records" /><Stat title="Active" value={deliveries.filter((d) => ACTIVE_STATUSES.includes(d.status)).length} icon={Activity} sub="Currently in motion" /></div><div className="grid-2"><div className="card"><h3>Top delivery areas</h3>{metrics.areas.length ? <div className="rank-list">{metrics.areas.map(([area, count]) => <div key={area}><span>{area}</span><b>{count}</b><div className="mini-progress"><i style={{ width: `${Math.min((count / metrics.areas[0][1]) * 100, 100)}%` }} /></div></div>)}</div> : <div className="empty"><BarChart3 size={30} /><p>Analytics will populate as deliveries arrive.</p></div>}</div><div className="card"><h3>Status distribution</h3><div className="rank-list">{Object.entries(deliveries.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {})).map(([status, count]) => <div key={status}><span><Status value={status} /></span><b>{count}</b></div>)}</div></div></div></div>;
}

function Audit() {
  const { audit, loading, error, refresh } = useData();
  return <div className="page"><div className="toolbar"><div><h3>Audit log</h3><p className="muted">Security-sensitive operational events from Supabase.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={17} /> Refresh</button></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="card">{audit.length ? audit.map((event) => <div className="audit-row" key={event.id}><div className="audit-icon"><ShieldCheck size={16} /></div><div><b>{event.action.replaceAll('_', ' ')}</b><small>{event.resource_type || 'system'}{event.resource_id ? ` · ${event.resource_id}` : ''} · {new Date(event.created_at).toLocaleString('en-KE')}</small></div></div>) : <div className="empty"><ShieldCheck size={30} /><h3>No audit events</h3><p>Operational events will appear here after the first assignment or status change.</p></div>}</div></div>;
}

function SettingsPage() {
  const shopifyEnabled = import.meta.env.VITE_SHOPIFY_ENABLED === 'true';
  return <div className="page"><div className="settings-grid"><div className="card"><p className="eyebrow">MAPPING</p><h3>TomTom</h3><p className="muted">Search, geocoding, routing and traffic are accessed through the server-side provider integration.</p><div className="connection"><span className="availability available"><i /> Server configured</span><small>The TomTom credential stays in Render environment variables.</small></div></div><div className="card"><p className="eyebrow">SHOPIFY</p><h3>Commerce connection</h3><p className="muted">Shopify remains the source of truth for products, checkout, customers and orders.</p><div className="connection"><span className={`availability ${shopifyEnabled ? 'available' : ''}`}><i /> {shopifyEnabled ? 'Enabled' : 'Not connected'}</span><small>{shopifyEnabled ? 'Shopify credentials are configured server-side.' : 'Connect Shopify later when the merchant provides store/app access.'}</small></div></div><div className="card"><p className="eyebrow">SECURITY</p><h3>Operational controls</h3><div className="setting-line"><div><b>Role-based access</b><small>Server-side permissions for Admin, Dispatcher and Rider.</small></div><span className="availability available"><i /> Enabled</span></div><div className="setting-line"><div><b>Audit logging</b><small>Assignment and status changes are recorded.</small></div><span className="availability available"><i /> Enabled</span></div><div className="setting-line"><div><b>Webhook verification</b><small>Shopify HMAC verification is enforced before recording events.</small></div><span className="availability available"><i /> Enabled</span></div></div></div></div>;
}

function RiderHome() {
  const { deliveries, loading, error, refresh } = useData(); const [routeInfo, setRouteInfo] = useState('');
  const assigned = deliveries.filter((d) => d.rider_id); const current = assigned.find((d) => ACTIVE_STATUSES.includes(d.status)) || assigned[0];
  async function navigateToDelivery() {
    if (!current?.lat || !current?.lng) return setRouteInfo('This delivery does not have a GPS pin yet.');
    if (!navigator.geolocation) return setRouteInfo('Location services are not available on this device.');
    setRouteInfo('Calculating route…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const route = await tomtomRoute({ lat: coords.latitude, lng: coords.longitude }, { lat: current.lat, lng: current.lng });
        const summary = route?.routes?.[0]?.summary;
        const minutes = summary ? Math.round(summary.travelTimeInSeconds / 60) : null;
        const km = summary ? (summary.lengthInMeters / 1000).toFixed(1) : null;
        setRouteInfo(summary ? `${km} km · about ${minutes} min with current traffic` : 'Route calculated.');
      } catch (err) { setRouteInfo(err.message || 'Unable to calculate route.'); }
    }, () => setRouteInfo('Location permission is required to calculate the route.'));
  }
  async function advance() {
    const next = current?.status === 'ASSIGNED' ? 'PICKED_UP' : current?.status === 'PICKED_UP' ? 'OUT_FOR_DELIVERY' : current?.status === 'OUT_FOR_DELIVERY' ? 'ARRIVED' : 'DELIVERED';
    if (!current) return;
    try { await updateDeliveryStatus(current.id, next); await refresh(); } catch (err) { setRouteInfo(err.message || 'Unable to update delivery.'); }
  }
  return <div className="rider-mobile"><div className="rider-brand"><img src="/logo.png" alt="Deliver Mtaani" /><div><b>Deliver Mtaani</b><small>Rider operations</small></div><button className="icon-btn" onClick={() => signOut()} aria-label="Sign out"><LogOut size={18} /></button></div><div className="rider-greeting"><p className="eyebrow">TODAY'S RUN</p><h1>Your deliveries</h1><p>Keep your route moving. Large, simple actions for the road.</p></div><DataNotice loading={loading} error={error} onRetry={refresh} /><div className="rider-metrics"><div><b>{assigned.length}</b><span>Assigned</span></div><div><b>{assigned.filter((d) => d.status === 'DELIVERED').length}</b><span>Completed</span></div><div><b>{assigned.filter((d) => ['OUT_FOR_DELIVERY', 'ARRIVED'].includes(d.status)).length}</b><span>On route</span></div></div>{current ? <div className="rider-job card"><div className="job-top"><div><span className="eyebrow">NEXT DELIVERY</span><h2>{current.order_number}</h2></div><Status value={current.status} /></div><div className="customer"><div className="avatar big">{current.customer_name[0]}</div><div><b>{current.customer_name}</b><small>{current.customer_phone || 'No phone number'}</small></div></div><div className="location-box"><MapPinned size={20} /><div><b>{current.estate || current.area || 'Location required'}</b><span>{[current.building, current.landmark].filter(Boolean).join(' · ')}</span><small>{current.instructions || 'No additional instructions'}</small></div></div>{routeInfo && <div className="route-info"><RouteIcon size={17} />{routeInfo}</div>}<div className="rider-actions"><button className="primary" onClick={navigateToDelivery}><Navigation size={18} /> Route</button><button className="secondary" onClick={advance}>{current.status === 'ASSIGNED' ? 'Picked up' : current.status === 'PICKED_UP' ? 'On the way' : current.status === 'OUT_FOR_DELIVERY' ? 'Arrived' : 'Mark delivered'}</button></div></div> : <div className="empty card"><CheckCircle2 size={34} /><h3>No active deliveries</h3><p>New assignments will appear here.</p></div>}<div className="rider-list"><h3>My queue</h3>{assigned.map((d) => <div className="rider-queue card" key={d.id}><div><b>{d.order_number} · {d.customer_name}</b><small>{d.area || 'Area pending'} · {d.estate || 'Location pending'}</small></div><Status value={d.status} /></div>)}</div></div>;
}

function AuthGate() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.active) return <div className="login-shell"><div className="login-card"><CircleAlert size={34} /><h1>Account unavailable</h1><p className="muted">Your operational account is inactive or has not been configured.</p><button className="secondary full" onClick={() => signOut()}>Sign out</button></div></div>;
  return profile.role === 'RIDER' ? <RiderHome /> : <AppShell />;
}

export default function App() {
  return <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<AuthGate />} /></Routes>;
}
