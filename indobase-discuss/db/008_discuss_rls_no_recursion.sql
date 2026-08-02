-- Indobase Discuss — break FORCE RLS recursion.
-- Helpers that read discuss.* must SET row_security = off, and policies must not
-- re-select the same table under RLS (classic infinite recursion).

begin;

create or replace function discuss.current_project_ref()
returns text
language sql
stable
security definer
set search_path = discuss, pg_catalog
set row_security = off
as $$
  select nullif(current_setting('request.jwt.claim.project_ref', true), '');
$$;

create or replace function discuss.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discuss, pg_catalog
set row_security = off
as $$
  select m.id
  from discuss.members m
  where discuss.current_project_ref() is not null
    and m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = discuss.current_project_ref();
$$;

-- Channel ids the caller belongs to (bypasses channel_members RLS).
create or replace function discuss.my_channel_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discuss, pg_catalog
set row_security = off
as $$
  select cm.channel_id
  from discuss.channel_members cm
  where cm.member_id in (select discuss.current_member_ids());
$$;

create or replace function discuss.my_project_refs()
returns setof text
language sql
stable
security definer
set search_path = discuss, pg_catalog
set row_security = off
as $$
  select distinct m.project_ref
  from discuss.members m
  where m.id in (select discuss.current_member_ids());
$$;

revoke all on function discuss.current_project_ref() from public;
revoke all on function discuss.current_member_ids() from public;
revoke all on function discuss.my_channel_ids() from public;
revoke all on function discuss.my_project_refs() from public;
grant execute on function discuss.current_project_ref() to authenticated, service_role, anon;
grant execute on function discuss.current_member_ids() to authenticated, service_role;
grant execute on function discuss.my_channel_ids() to authenticated, service_role;
grant execute on function discuss.my_project_refs() to authenticated, service_role;

-- Members: JWT project match + caller is a member (no self-select on members).
drop policy if exists members_self_project on discuss.members;
create policy members_self_project on discuss.members
  for select using (
    discuss.current_project_ref() is not null
    and project_ref = discuss.current_project_ref()
    and exists (select 1 from discuss.current_member_ids())
  );

drop policy if exists channels_visible on discuss.channels;
create policy channels_visible on discuss.channels
  for select using (
    discuss.current_project_ref() is not null
    and (
      id in (select discuss.my_channel_ids())
      or (
        not is_private
        and project_ref = discuss.current_project_ref()
        and exists (select 1 from discuss.current_member_ids())
      )
    )
  );

drop policy if exists channel_members_visible on discuss.channel_members;
create policy channel_members_visible on discuss.channel_members
  for select using (
    channel_id in (select discuss.my_channel_ids())
  );

drop policy if exists messages_read on discuss.messages;
create policy messages_read on discuss.messages
  for select using (
    deleted_at is null
    and channel_id in (select discuss.my_channel_ids())
  );

drop policy if exists messages_write on discuss.messages;
create policy messages_write on discuss.messages
  for insert with check (
    author_id in (select discuss.current_member_ids())
    and channel_id in (select discuss.my_channel_ids())
    and exists (
      select 1 from discuss.members m
      where m.id = author_id and m.role <> 'viewer'
    )
  );

-- Bootstrap inserts must bypass FORCE RLS (function owner is still subject to FORCE).
create or replace function discuss.ensure_project_setup(
  p_project_ref  text,
  p_gotrue_id    uuid,
  p_email        text,
  p_display_name text,
  p_role         text
)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
set row_security = off
as $$
declare
  v_member_id uuid;
  v_channel   record;
begin
  if p_project_ref is null or p_gotrue_id is null then
    raise exception 'project_ref and gotrue_id are required';
  end if;

  if p_role not in ('owner', 'admin', 'developer', 'viewer') then
    raise exception 'unknown role: %', p_role;
  end if;

  insert into discuss.members (gotrue_id, project_ref, email, display_name, role, last_seen_at)
  values (p_gotrue_id, p_project_ref, p_email, p_display_name, p_role, now())
  on conflict (gotrue_id, project_ref) do update
    set email        = excluded.email,
        display_name = excluded.display_name,
        role         = excluded.role,
        last_seen_at = now()
  returning id into v_member_id;

  for v_channel in
    select * from (values
      ('general',      'General',      'Project-wide discussion',                'standard'),
      ('announcements','Announcements','Updates that everyone should see',       'standard'),
      ('activity',     'Activity',     'Deploys, payments and builds, live',     'activity')
    ) as t(slug, name, topic, kind)
  loop
    insert into discuss.channels (project_ref, slug, name, topic, kind, created_by)
    values (p_project_ref, v_channel.slug, v_channel.name, v_channel.topic, v_channel.kind, v_member_id)
    on conflict (project_ref, slug) do nothing;
  end loop;

  insert into discuss.channel_members (channel_id, member_id)
  select c.id, v_member_id
  from discuss.channels c
  where c.project_ref = p_project_ref
    and c.is_private = false
    and c.archived_at is null
  on conflict do nothing;

  return v_member_id;
end;
$$;

revoke all on function discuss.ensure_project_setup(text, uuid, text, text, text) from public;

commit;
