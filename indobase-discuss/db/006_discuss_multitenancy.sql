-- Indobase Discuss — project-scoped multitenancy.
-- Temporary Discuss JWTs already include `project_ref` (see createTemporaryProjectApiKey).
-- Until this migration, current_member_ids() matched every project the user belonged to on a
-- shared database. Scope membership to the JWT project claim so isolation is enforced in Postgres.

begin;

create or replace function discuss.current_project_ref()
returns text
language sql
stable
security definer
set search_path = discuss, pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.project_ref', true), '');
$$;

revoke all on function discuss.current_project_ref() from public;
grant execute on function discuss.current_project_ref() to authenticated, service_role, anon;

-- Fail closed: require JWT project_ref (same bar as CRM 007). No claim → no membership.
create or replace function discuss.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discuss, pg_catalog
as $$
  select m.id
  from discuss.members m
  where discuss.current_project_ref() is not null
    and m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = discuss.current_project_ref();
$$;

-- Members of *this* project only.
drop policy if exists members_self_project on discuss.members;
create policy members_self_project on discuss.members
  for select using (
    discuss.current_project_ref() is not null
    and project_ref = discuss.current_project_ref()
    and exists (
      select 1 from discuss.members me
      where me.id in (select discuss.current_member_ids())
        and me.project_ref = discuss.members.project_ref
    )
  );

-- Public channels: membership of the JWT project only.
drop policy if exists channels_visible on discuss.channels;
create policy channels_visible on discuss.channels
  for select using (
    discuss.current_project_ref() is not null
    and (
      exists (
        select 1 from discuss.channel_members cm
        where cm.channel_id = channels.id
          and cm.member_id in (select discuss.current_member_ids())
      )
      or (
        not is_private
        and project_ref = discuss.current_project_ref()
        and project_ref in (
          select m.project_ref
          from discuss.members m
          where m.id in (select discuss.current_member_ids())
        )
      )
    )
  );

-- Best-effort: expose `discuss` to PostgREST via in-DB role config so older stacks that still
-- only list public/storage/graphql_public start accepting the schema after reload.
do $$
declare
  v_role oid;
  v_db oid;
  v_cur text;
  v_next text := 'public, storage, graphql_public, discuss, crm';
  v_entry text;
  v_parts text[];
  v_has_discuss boolean := false;
  v_has_crm boolean := false;
begin
  select oid into v_role from pg_roles where rolname = 'authenticator';
  if v_role is null then
    return;
  end if;

  select oid into v_db from pg_database where datname = current_database();

  select nullif(
    (
      select trim(both from substring(cfg from length('pgrst.db_schemas=') + 1))
      from unnest(coalesce(s.setconfig, '{}'::text[])) as cfg
      where cfg like 'pgrst.db_schemas=%'
      limit 1
    ),
    ''
  )
  into v_cur
  from pg_db_role_setting s
  where s.setrole = v_role
    and (s.setdatabase = v_db or s.setdatabase = 0)
  order by case when s.setdatabase = v_db then 0 else 1 end
  limit 1;

  if v_cur is not null then
    v_parts := string_to_array(replace(v_cur, ' ', ''), ',');
    foreach v_entry in array v_parts loop
      if lower(v_entry) = 'discuss' then
        v_has_discuss := true;
      end if;
      if lower(v_entry) = 'crm' then
        v_has_crm := true;
      end if;
    end loop;
    v_next := v_cur;
    if not v_has_discuss then
      v_next := v_next || ', discuss';
    end if;
    if not v_has_crm then
      v_next := v_next || ', crm';
    end if;
  end if;

  execute format(
    'alter role authenticator in database %I set pgrst.db_schemas to %L',
    current_database(),
    v_next
  );
exception
  when insufficient_privilege then null;
  when undefined_object then null;
  when others then null;
end
$$;

do $$
begin
  perform pg_notify('pgrst', 'reload config');
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then null;
end
$$;

commit;
