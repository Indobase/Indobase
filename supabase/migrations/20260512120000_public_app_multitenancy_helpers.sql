-- App-layer shared-table multitenancy helpers (public schema).
-- Functions only (no example tables). Pair with tenant_id columns + RLS on your tables.
-- See templates/shared_table_rls/ and MULTITENANCY_RLS.md.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(j->>'tenant_id', '')::uuid,
    nullif(j->'app_metadata'->>'tenant_id', '')::uuid,
    nullif(
      trim(both '"' from coalesce(current_setting('request.jwt.claim.tenant_id', true), '')),
      ''
    )::uuid,
    nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  from (select current_setting('request.jwt.claims', true)::json as j) c;
$$;

comment on function public.current_tenant_id() is
  'RLS tenant: JWT tenant_id, app_metadata.tenant_id, request.jwt.claim.tenant_id, or app.tenant_id.';

create or replace function public.set_tenant_id(tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.tenant_id', coalesce(tenant::text, ''), true);
$$;

comment on function public.set_tenant_id(uuid) is
  'Sets app.tenant_id for the current transaction (service role / backend).';

grant execute on function public.current_tenant_id() to authenticated, service_role;
grant execute on function public.set_tenant_id(uuid) to service_role;
