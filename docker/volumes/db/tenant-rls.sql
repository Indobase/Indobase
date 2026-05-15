-- Single-DB multi-tenancy foundation (Option: shared database + strict RLS)
--
-- This script provides:
-- - `app.project_ref()` helper to read tenant context from PostgREST request JWT claims / headers
-- - `app.set_project_ref()` db_pre_request hook to fail-closed if tenant context is missing
--
-- Apply via Postgres init scripts (docker-compose db mounts) or as a migration in production.

create schema if not exists app;
create schema if not exists tenant;

-- Returns the current project ref (tenant identifier) for this request.
-- Priority: JWT claim -> existing session GUC (if already set).
create or replace function app.project_ref()
returns text
language sql
stable
as $$
  select
    nullif(
      coalesce(
        (current_setting('request.jwt.claims', true)::json ->> 'project_ref'),
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
set search_path = pg_catalog, app, public
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
-- PERMANENT GUARDRAILS (recommended):
-- Ensure new tenant-owned tables are always created with:
-- - project_ref column
-- - RLS enabled + forced
-- - tenant isolation policy
--
-- Convention: create all tenant-owned tables in schema `tenant`.
-- ---------------------------------------------------------------------------

create or replace function app.tenantize_table(target regclass)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app, public
as $$
declare
  sch text;
  tbl text;
  has_col boolean;
  policy_exists boolean;
begin
  select n.nspname, c.relname
    into sch, tbl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.oid = target;

  if sch is null or tbl is null then
    raise exception 'Table not found for %', target;
  end if;

  if sch <> 'tenant' then
    raise exception 'tenantize_table only allowed for schema tenant' using errcode = '42501';
  end if;

  -- Add project_ref column if missing (nullable by default to avoid breaking existing rows).
  select exists (
    select 1
    from information_schema.columns
    where table_schema = sch and table_name = tbl and column_name = 'project_ref'
  ) into has_col;

  if not has_col then
    execute format('alter table %I.%I add column project_ref text', sch, tbl);
    execute format('create index if not exists %I on %I.%I (project_ref)', tbl || '_project_ref_idx', sch, tbl);
  end if;

  -- Enable and FORCE RLS so even table owners can’t bypass tenant policies accidentally.
  execute format('alter table %I.%I enable row level security', sch, tbl);
  execute format('alter table %I.%I force row level security', sch, tbl);

  -- Create tenant policy if missing.
  select exists (
    select 1
    from pg_policies
    where schemaname = sch and tablename = tbl and policyname = 'tenant_isolation'
  ) into policy_exists;

  if not policy_exists then
    execute format($fmt$
      create policy tenant_isolation on %I.%I
        for all
        using (project_ref = app.project_ref())
        with check (project_ref = app.project_ref())
    $fmt$, sch, tbl);
  end if;
end;
$$;

revoke execute on function app.tenantize_table(regclass) from public;
grant execute on function app.tenantize_table(regclass) to postgres, service_role;

create or replace function app.on_create_tenant_table()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog, app, public
as $$
declare
  rec record;
begin
  for rec in
    select *
    from pg_event_trigger_ddl_commands()
    where object_type = 'table'
  loop
    -- Only auto-tenantize tables in schema `tenant`.
    if rec.schema_name = 'tenant' then
      perform app.tenantize_table((rec.schema_name || '.' || rec.object_name)::regclass);
    end if;
  end loop;
end;
$$;

drop event trigger if exists tr_tenantize_new_tables;
create event trigger tr_tenantize_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS')
  execute function app.on_create_tenant_table();

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

