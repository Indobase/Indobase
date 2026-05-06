-- Single-DB multi-tenancy foundation (Option: shared database + strict RLS)
--
-- This script provides:
-- - `app.project_ref()` helper to read tenant context from PostgREST request JWT claims / headers
-- - `app.set_project_ref()` db_pre_request hook to fail-closed if tenant context is missing
--
-- Apply via Postgres init scripts (docker-compose db mounts) or as a migration in production.

create schema if not exists app;

-- Returns the current project ref (tenant identifier) for this request.
-- Priority: JWT claim -> request header -> existing session GUC (if already set).
create or replace function app.project_ref()
returns text
language sql
stable
as $$
  select
    nullif(
      coalesce(
        (current_setting('request.jwt.claims', true)::json ->> 'project_ref'),
        (current_setting('request.headers', true)::json ->> 'x-project-ref'),
        current_setting('app.project_ref', true)
      ),
      ''
    );
$$;

-- PostgREST hook: called at the beginning of every request.
-- It sets `app.project_ref` in the DB session and FAILS CLOSED if missing.
create or replace function app.set_project_ref()
returns void
language plpgsql
security definer
as $$
declare
  ref text;
begin
  ref := app.project_ref();
  if ref is null then
    raise exception 'Missing tenant context (project_ref)' using errcode = '42501';
  end if;
  perform set_config('app.project_ref', ref, true);
end;
$$;

-- Allow PostgREST roles to execute the hook/helpers.
grant usage on schema app to public;
grant execute on function app.project_ref() to public;
grant execute on function app.set_project_ref() to public;

-- ---------------------------------------------------------------------------
-- TEMPLATE: RLS policy pattern for tenant-owned tables
--
-- 1) Add a tenant key:
--    alter table public.my_table add column project_ref text not null;
--    create index on public.my_table (project_ref);
--
-- 2) Enable RLS:
--    alter table public.my_table enable row level security;
--
-- 3) Enforce tenant isolation:
--    create policy tenant_isolation on public.my_table
--      for all
--      using (project_ref = app.project_ref())
--      with check (project_ref = app.project_ref());
--
-- NOTE: You must apply this to EVERY tenant-owned table to fully eliminate
-- cross-tenant visibility in a single shared database.
-- ---------------------------------------------------------------------------

