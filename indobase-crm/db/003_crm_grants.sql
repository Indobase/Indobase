-- Indobase CRM — PostgREST grants.

begin;

grant usage on schema crm to anon, authenticated, service_role;

grant select on crm.members to authenticated, service_role;
grant select, insert, update, delete on crm.companies to authenticated, service_role;
grant select, insert, update, delete on crm.contacts to authenticated, service_role;
grant select on crm.stages to authenticated, service_role;
grant select, insert, update, delete on crm.stages to service_role;
grant select, insert, update, delete on crm.deals to authenticated, service_role;

grant execute on function crm.current_member_ids() to authenticated, service_role;
grant execute on function crm.current_project_ref() to authenticated, service_role, anon;

revoke all on function crm.ensure_project_setup(text, uuid, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant usage on schema crm to authenticator;
  end if;
end
$$;

-- Best-effort: expose crm on PostgREST for older stacks.
do $$
declare
  v_role oid;
  v_db oid;
  v_cur text;
  v_next text := 'public, storage, graphql_public, discuss, crm';
  v_entry text;
  v_parts text[];
  v_has boolean := false;
begin
  select oid into v_role from pg_roles where rolname = 'authenticator';
  if v_role is null then return; end if;
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
  where s.setrole = v_role and (s.setdatabase = v_db or s.setdatabase = 0)
  order by case when s.setdatabase = v_db then 0 else 1 end
  limit 1;

  if v_cur is not null then
    v_parts := string_to_array(replace(v_cur, ' ', ''), ',');
    foreach v_entry in array v_parts loop
      if lower(v_entry) = 'crm' then v_has := true; end if;
    end loop;
    if not v_has then
      v_next := v_cur || ', crm';
    else
      v_next := v_cur;
    end if;
  end if;

  execute format(
    'alter role authenticator in database %I set pgrst.db_schemas to %L',
    current_database(),
    v_next
  );
exception
  when others then null;
end
$$;

do $$
begin
  perform pg_notify('pgrst', 'reload config');
  perform pg_notify('pgrst', 'reload schema');
exception when others then null;
end
$$;

commit;
