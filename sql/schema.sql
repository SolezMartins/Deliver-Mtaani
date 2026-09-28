-- Deliver Mtaani production schema for Supabase/PostgreSQL.
create extension if not exists pgcrypto;

create type public.app_role as enum ('ADMIN','DISPATCHER','RIDER');
create type public.delivery_status as enum ('NEW','LOCATION_REQUIRED','LOCATION_CONFIRMED','READY_FOR_DISPATCH','ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','DELIVERY_FAILED','RESCHEDULED','CANCELLED');

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'RIDER',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.riders(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  availability text not null default 'AVAILABLE',
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_zones(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  coverage text,
  fee numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries(
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique,
  order_number text not null,
  customer_name text not null,
  customer_phone text,
  order_value numeric(12,2) default 0,
  status public.delivery_status not null default 'NEW',
  readiness integer not null default 0 check(readiness between 0 and 100),
  county text,
  city text,
  area text,
  estate text,
  street text,
  building text,
  block text,
  floor text,
  unit text,
  landmark text,
  instructions text,
  lat double precision,
  lng double precision,
  gps_accuracy double precision,
  location_source text,
  tomtom_place_id text,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  rider_id uuid references public.riders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_events(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  from_status public.delivery_status,
  to_status public.delivery_status,
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_proofs(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  recipient_name text,
  notes text,
  photo_url text,
  signature_url text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events(
  id uuid primary key default gen_random_uuid(),
  shopify_event_id text unique,
  topic text not null,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deliveries_status_idx on public.deliveries(status);
create index if not exists deliveries_rider_idx on public.deliveries(rider_id);
create index if not exists deliveries_created_idx on public.deliveries(created_at desc);
create index if not exists delivery_events_delivery_idx on public.delivery_events(delivery_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.is_role(r public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = r and active = true);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deliveries_touch on public.deliveries;
create trigger deliveries_touch before update on public.deliveries for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.riders enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.delivery_events enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhook_events enable row level security;

-- Remove/recreate named policies so rerunning this file remains deterministic.
drop policy if exists profiles_self on public.profiles;
drop policy if exists operational_read_deliveries on public.deliveries;
drop policy if exists operational_read_riders on public.riders;
drop policy if exists operational_read_zones on public.delivery_zones;
drop policy if exists admin_zone_all on public.delivery_zones;
drop policy if exists admin_audit_read on public.audit_logs;
drop policy if exists admin_events_read on public.delivery_events;
drop policy if exists rider_events_read on public.delivery_events;
drop policy if exists rider_proofs_read on public.delivery_proofs;

create policy profiles_self on public.profiles
  for select using (id = auth.uid() or public.is_role('ADMIN'));

create policy operational_read_deliveries on public.deliveries
  for select using (
    public.is_role('ADMIN')
    or public.is_role('DISPATCHER')
    or (public.is_role('RIDER') and rider_id = (select id from public.riders where profile_id = auth.uid()))
  );

create policy operational_read_riders on public.riders
  for select using (public.is_role('ADMIN') or public.is_role('DISPATCHER') or profile_id = auth.uid());

create policy operational_read_zones on public.delivery_zones
  for select using (public.is_role('ADMIN') or public.is_role('DISPATCHER'));

create policy admin_zone_all on public.delivery_zones
  for all using (public.is_role('ADMIN')) with check (public.is_role('ADMIN'));

create policy admin_audit_read on public.audit_logs
  for select using (public.is_role('ADMIN'));

create policy admin_events_read on public.delivery_events
  for select using (public.is_role('ADMIN') or public.is_role('DISPATCHER'));

create policy rider_events_read on public.delivery_events
  for select using (
    public.is_role('RIDER')
    and delivery_id in (
      select d.id from public.deliveries d
      join public.riders r on r.id = d.rider_id
      where r.profile_id = auth.uid()
    )
  );

create policy rider_proofs_read on public.delivery_proofs
  for select using (
    public.is_role('ADMIN')
    or public.is_role('DISPATCHER')
    or delivery_id in (
      select d.id from public.deliveries d
      join public.riders r on r.id = d.rider_id
      where r.profile_id = auth.uid()
    )
  );

-- Mutations for operational records are intentionally performed through the verified Render API.
-- The Render service-role key bypasses RLS and is never exposed to the browser.
