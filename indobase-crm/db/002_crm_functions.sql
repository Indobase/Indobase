-- Indobase CRM — provisioning + realtime.

begin;

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

  -- Default pipeline for sales MVP.
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

do $$
begin
  alter publication supabase_realtime add table crm.deals;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

commit;
