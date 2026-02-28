-- Shared-Table (RLS) Multitenancy
-- One cluster; all tenants share tables. RLS restricts rows by tenant_id from JWT.
-- Copy this migration into your project's supabase/migrations and run it there.

-- Helper: current tenant from JWT or app.tenant_id (set by your app or auth hook)
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid,
    nullif(current_setting('app.tenant_id', true), '')::uuid
  );
$$;

comment on function public.current_tenant_id() is 'Tenant id for RLS; read from JWT claim tenant_id or app.tenant_id.';

-- Optional: allow setting tenant per-request (e.g. from backend with service role)
create or replace function public.set_tenant_id(tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  perform set_config('app.tenant_id', coalesce(tenant::text, ''), true);
$$;

-- Example: devices table (tenant-scoped). Add tenant_id to all shared tenant tables.
create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  name       text,
  metadata   jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_devices_tenant_id on public.devices (tenant_id);

alter table public.devices enable row level security;

-- RLS: only rows for the current tenant (from JWT or app.tenant_id)
create policy "tenant_select"
  on public.devices for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "tenant_insert"
  on public.devices for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_update"
  on public.devices for update
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "tenant_delete"
  on public.devices for delete
  to authenticated
  using (tenant_id = public.current_tenant_id());

-- Optional: service role can bypass RLS for admin operations (default in Postgres)
-- No policy for service_role needed; RLS is not applied to table owner / superuser.

comment on table public.devices is 'Tenant-scoped devices; RLS enforces tenant_id from JWT or app.tenant_id.';
