-- Indobase Discuss — server-side operations.
--
-- These run as SECURITY INVOKER (the default), so every statement inside them is still filtered by
-- the RLS policies in 001. That is deliberate: a SECURITY DEFINER helper would silently become a
-- hole through the isolation boundary, which is exactly the failure mode that disqualified the
-- shared-site Frappe design.
--
-- Anything that MUST cross the boundary (provisioning a project's first channels) is marked
-- DEFINER and kept as small and as auditable as possible.

begin;

-- ── Provisioning ────────────────────────────────────────────────────────────────────────────────
-- Called on the first Discuss open for a project. Creates the member row and the default channels.
--
-- SECURITY DEFINER because the caller has no member row yet, so RLS would reject every statement
-- here — the classic bootstrap problem. Kept deliberately narrow: it only ever writes rows scoped
-- to the project_ref it was handed, and it never reads anything back to the caller.
--
-- Idempotent. It runs on every launch, and the Mattermost integration failed precisely because a
-- provisioning step silently did nothing and nobody noticed until users had no channels at all.
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

  -- Studio owns identity: refresh the projection on every launch so a role change there takes
  -- effect here immediately rather than at some later sync.
  insert into discuss.members (gotrue_id, project_ref, email, display_name, role, last_seen_at)
  values (p_gotrue_id, p_project_ref, p_email, p_display_name, p_role, now())
  on conflict (gotrue_id, project_ref) do update
    set email        = excluded.email,
        display_name = excluded.display_name,
        role         = excluded.role,
        last_seen_at = now()
  returning id into v_member_id;

  -- Default channels. Named for what a business actually does, not upstream chat vocabulary —
  -- no "Town Square", no "Off-Topic".
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

  -- Join the member to every public channel in the project. Mattermost's equivalent step failed
  -- silently and left users in ZERO channels, which the product rendered as "Join a team" with no
  -- explanation — so this is idempotent and its effect is asserted by the caller.
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

-- ── Unread counts ───────────────────────────────────────────────────────────────────────────────
-- One round trip for the whole sidebar. SECURITY INVOKER, so RLS restricts it to the caller's own
-- channels automatically — there is no project_ref parameter to get wrong.
create or replace function discuss.unread_counts()
returns table (channel_id uuid, unread bigint, last_message_at timestamptz)
language sql
stable
as $$
  select
    c.id,
    count(m.id) filter (
      where m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
        and m.author_id is distinct from cm.member_id
    ) as unread,
    max(m.created_at) as last_message_at
  from discuss.channels c
  join discuss.channel_members cm
    on cm.channel_id = c.id
   and cm.member_id in (select discuss.current_member_ids())
  left join discuss.read_state rs
    on rs.channel_id = c.id and rs.member_id = cm.member_id
  left join discuss.messages m
    on m.channel_id = c.id
   and m.deleted_at is null
   and m.parent_id is null
  where c.archived_at is null
  group by c.id, cm.member_id, rs.last_read_at;
$$;

-- ── Platform events ─────────────────────────────────────────────────────────────────────────────
-- How Builder, Payments, Deploy and the rest publish into a project's Activity channel. This is
-- the feature that justifies building Discuss rather than forking a chat product.
--
-- SECURITY DEFINER because the publisher is a service, not a member of the project.
create or replace function discuss.publish_event(
  p_project_ref text,
  p_event_type  text,
  p_event_data  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_channel_id uuid;
  v_message_id uuid;
begin
  select id into v_channel_id
  from discuss.channels
  where project_ref = p_project_ref and kind = 'activity' and archived_at is null
  limit 1;

  -- A project that has never opened Discuss has no activity channel yet. Dropping the event is
  -- correct: creating channels as a side effect of an unrelated deploy would be surprising, and
  -- the event is already recorded by the product that emitted it.
  if v_channel_id is null then
    return null;
  end if;

  insert into discuss.messages (channel_id, project_ref, author_id, event_type, event_data)
  values (v_channel_id, p_project_ref, null, p_event_type, p_event_data)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function discuss.publish_event(text, text, jsonb) from public;

-- ── Realtime ────────────────────────────────────────────────────────────────────────────────────
-- Realtime replays RLS for each subscriber, so a client only receives rows it could have SELECTed.
-- The isolation guarantee is the same one the database already enforces — no second access-control
-- system to keep in sync, which is where forked chat products leak.
do $$
begin
  alter publication supabase_realtime add table discuss.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    -- Shared / early tenants may not have the publication yet; Discuss still works without live
    -- updates until Realtime is provisioned.
    null;
end
$$;

commit;
