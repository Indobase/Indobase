-- Indobase CRM — break FORCE RLS recursion on crm.members and helpers.

begin;

-- PostgREST on PostgreSQL 14+ exposes JWT as request.jwt.claims (JSON). Legacy
-- request.jwt.claim.* GUCs are not set — prefer the JSON bag, fall back for older stacks.
create or replace function crm.current_project_ref()
returns text
language sql
stable
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json->>'project_ref',
    nullif(current_setting('request.jwt.claim.project_ref', true), '')
  );
$$;

create or replace function crm.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
  select m.id
  from crm.members m
  where crm.current_project_ref() is not null
    and m.gotrue_id = coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
      nullif(current_setting('request.jwt.claim.sub', true), '')
    )::uuid
    and m.project_ref = crm.current_project_ref();
$$;

revoke all on function crm.current_project_ref() from public;
revoke all on function crm.current_member_ids() from public;
grant execute on function crm.current_project_ref() to authenticated, service_role, anon;
grant execute on function crm.current_member_ids() to authenticated, service_role;

-- No self-select on crm.members (that recursed under FORCE RLS).
drop policy if exists crm_members_select on crm.members;
create policy crm_members_select on crm.members
  for select using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and exists (select 1 from crm.current_member_ids())
  );

-- ensure_project_setup inserts as SECURITY DEFINER but FORCE RLS still applies to the
-- function owner unless row_security is off for the session of that function.
create or replace function crm.ensure_project_setup(
  p_project_ref  text,
  p_gotrue_id    uuid,
  p_email        text,
  p_display_name text,
  p_role         text
)
returns uuid
language plpgsql
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
declare
  v_member_id uuid;
  v_stage record;
begin
  if p_project_ref is null or p_gotrue_id is null then
    raise exception 'project_ref and gotrue_id are required';
  end if;
  if p_role not in ('owner', 'admin', 'developer', 'viewer') then
    raise exception 'unknown role: %', p_role;
  end if;

  insert into crm.members (gotrue_id, project_ref, email, display_name, role, last_seen_at)
  values (p_gotrue_id, p_project_ref, p_email, p_display_name, p_role, now())
  on conflict (gotrue_id, project_ref) do update
    set email        = excluded.email,
        display_name = excluded.display_name,
        role         = excluded.role,
        last_seen_at = now()
  returning id into v_member_id;

  for v_stage in
    select * from (values
      ('Lead', 0, false, false),
      ('Qualified', 1, false, false),
      ('Proposal', 2, false, false),
      ('Won', 3, true, false),
      ('Lost', 4, false, true)
    ) as t(name, position, is_won, is_lost)
  loop
    insert into crm.stages (project_ref, name, position, is_won, is_lost)
    values (p_project_ref, v_stage.name, v_stage.position, v_stage.is_won, v_stage.is_lost)
    on conflict (project_ref, name) do nothing;
  end loop;

  return v_member_id;
end;
$$;

revoke all on function crm.ensure_project_setup(text, uuid, text, text, text) from public;
revoke all on function crm.ensure_project_setup(text, uuid, text, text, text) from authenticated, anon;

-- SET row_security=off requires a BYPASSRLS owner. Reassign to service_role; grant EXECUTE to
-- the installer (Studio SQL), not authenticated/anon.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage, create on schema crm to service_role;
    grant all on all tables in schema crm to service_role;
    grant all on all sequences in schema crm to service_role;
    alter function crm.ensure_project_setup(text, uuid, text, text, text) owner to service_role;
    alter function crm.current_project_ref() owner to service_role;
    alter function crm.current_member_ids() owner to service_role;
  end if;
  execute format(
    'grant execute on function crm.ensure_project_setup(text, uuid, text, text, text) to %I',
    current_user
  );
exception
  when insufficient_privilege then null;
  when undefined_object then null;
end
$$;

commit;
