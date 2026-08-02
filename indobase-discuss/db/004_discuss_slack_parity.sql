-- Indobase Discuss — Slack-parity additions (reactions, channel create, DMs).
-- Additive and idempotent. Applied after 001–003 by discuss/ensure.

begin;

-- Allow direct-message channels alongside standard + activity.
alter table discuss.channels drop constraint if exists channels_kind_check;
alter table discuss.channels
  add constraint channels_kind_check
  check (kind in ('standard', 'activity', 'direct'));

-- ── Reactions ───────────────────────────────────────────────────────────────────────────────────
create table if not exists discuss.reactions (
  message_id  uuid not null references discuss.messages (id) on delete cascade,
  member_id   uuid not null references discuss.members (id) on delete cascade,
  -- Short emoji / shortcode, e.g. '👍' or '+1'. Capped so a row cannot become a novel.
  emoji       text not null check (char_length(emoji) between 1 and 32),
  created_at  timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);

create index if not exists reactions_message_idx on discuss.reactions (message_id);

alter table discuss.reactions enable row level security;
alter table discuss.reactions force row level security;

create policy reactions_read on discuss.reactions
  for select using (
    message_id in (select id from discuss.messages)
  );

create policy reactions_write on discuss.reactions
  for insert with check (
    member_id in (select discuss.current_member_ids())
    and message_id in (select id from discuss.messages)
    and exists (
      select 1 from discuss.members m
      where m.id = member_id and m.role <> 'viewer'
    )
  );

create policy reactions_delete_own on discuss.reactions
  for delete using (member_id in (select discuss.current_member_ids()));

-- ── Channel create / join policies ──────────────────────────────────────────────────────────────
-- Non-viewers may create channels in projects they belong to. Membership of the new channel is
-- granted by the SECURITY DEFINER helpers below (or by joining a public channel).
drop policy if exists channels_insert on discuss.channels;
create policy channels_insert on discuss.channels
  for insert with check (
    project_ref in (
      select m.project_ref from discuss.members m
      where m.id in (select discuss.current_member_ids()) and m.role <> 'viewer'
    )
    and created_by in (select discuss.current_member_ids())
  );

drop policy if exists channels_update_meta on discuss.channels;
create policy channels_update_meta on discuss.channels
  for update using (
    created_by in (select discuss.current_member_ids())
    or exists (
      select 1 from discuss.members m
      where m.id in (select discuss.current_member_ids())
        and m.project_ref = channels.project_ref
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    created_by in (select discuss.current_member_ids())
    or exists (
      select 1 from discuss.members m
      where m.id in (select discuss.current_member_ids())
        and m.project_ref = channels.project_ref
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists channel_members_insert on discuss.channel_members;
create policy channel_members_insert on discuss.channel_members
  for insert with check (
    -- Join yourself to a public channel, or an owner/admin adding someone to a private one.
    member_id in (select discuss.current_member_ids())
    or exists (
      select 1
      from discuss.channels c
      join discuss.members m on m.project_ref = c.project_ref
      where c.id = channel_id
        and m.id in (select discuss.current_member_ids())
        and m.role in ('owner', 'admin')
    )
  );

-- Soft-deleted messages stay invisible via messages_read (deleted_at is null). Authors may soft
-- delete by setting deleted_at through messages_update_own.

-- ── Create a standard channel ───────────────────────────────────────────────────────────────────
create or replace function discuss.create_channel(
  p_project_ref text,
  p_name        text,
  p_topic       text default null,
  p_is_private  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_member_id uuid;
  v_role      text;
  v_slug      text;
  v_channel   uuid;
begin
  select m.id, m.role into v_member_id, v_role
  from discuss.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = p_project_ref
  limit 1;

  if v_member_id is null then
    raise exception 'not a Discuss member of this project';
  end if;
  if v_role = 'viewer' then
    raise exception 'viewers cannot create channels';
  end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    raise exception 'channel name must contain letters or numbers';
  end if;
  v_slug := left(v_slug, 48);

  insert into discuss.channels (project_ref, slug, name, topic, kind, is_private, created_by)
  values (
    p_project_ref,
    v_slug,
    left(trim(p_name), 80),
    nullif(trim(coalesce(p_topic, '')), ''),
    'standard',
    coalesce(p_is_private, false),
    v_member_id
  )
  on conflict (project_ref, slug) do update
    set name = excluded.name,
        topic = coalesce(excluded.topic, discuss.channels.topic)
  returning id into v_channel;

  -- Creator always joins. For public channels, every project member is joined too.
  insert into discuss.channel_members (channel_id, member_id)
  values (v_channel, v_member_id)
  on conflict do nothing;

  if not coalesce(p_is_private, false) then
    insert into discuss.channel_members (channel_id, member_id)
    select v_channel, m.id
    from discuss.members m
    where m.project_ref = p_project_ref
    on conflict do nothing;
  end if;

  return v_channel;
end;
$$;

revoke all on function discuss.create_channel(text, text, text, boolean) from public;
grant execute on function discuss.create_channel(text, text, text, boolean) to authenticated, service_role;

-- ── Open or reuse a 1:1 DM ──────────────────────────────────────────────────────────────────────
create or replace function discuss.open_direct_channel(
  p_project_ref     text,
  p_other_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_me        uuid;
  v_role      text;
  v_other     uuid;
  v_slug      text;
  v_channel   uuid;
  v_a         uuid;
  v_b         uuid;
begin
  select m.id, m.role into v_me, v_role
  from discuss.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = p_project_ref
  limit 1;

  if v_me is null then
    raise exception 'not a Discuss member of this project';
  end if;
  if v_role = 'viewer' then
    raise exception 'viewers cannot start direct messages';
  end if;
  if p_other_member_id = v_me then
    raise exception 'cannot open a direct message with yourself';
  end if;

  select m.id into v_other
  from discuss.members m
  where m.id = p_other_member_id and m.project_ref = p_project_ref;

  if v_other is null then
    raise exception 'other member not found in this project';
  end if;

  if v_me < v_other then
    v_a := v_me; v_b := v_other;
  else
    v_a := v_other; v_b := v_me;
  end if;

  v_slug := 'dm-' || replace(v_a::text || '-' || v_b::text, '-', '');

  select c.id into v_channel
  from discuss.channels c
  where c.project_ref = p_project_ref and c.slug = v_slug and c.kind = 'direct'
  limit 1;

  if v_channel is null then
    insert into discuss.channels (project_ref, slug, name, topic, kind, is_private, created_by)
    values (
      p_project_ref,
      left(v_slug, 64),
      'Direct message',
      null,
      'direct',
      true,
      v_me
    )
    returning id into v_channel;
  end if;

  insert into discuss.channel_members (channel_id, member_id)
  values (v_channel, v_me), (v_channel, v_other)
  on conflict do nothing;

  return v_channel;
end;
$$;

revoke all on function discuss.open_direct_channel(text, uuid) from public;
grant execute on function discuss.open_direct_channel(text, uuid) to authenticated, service_role;

-- Aggregated reactions for a set of messages (one round trip for the transcript).
create or replace function discuss.reaction_counts(p_message_ids uuid[])
returns table (message_id uuid, emoji text, count bigint, reacted_by_me boolean)
language sql
stable
security invoker
as $$
  select
    r.message_id,
    r.emoji,
    count(*)::bigint as count,
    bool_or(r.member_id in (select discuss.current_member_ids())) as reacted_by_me
  from discuss.reactions r
  where r.message_id = any(p_message_ids)
  group by r.message_id, r.emoji
  order by r.message_id, count desc, r.emoji;
$$;

grant execute on function discuss.reaction_counts(uuid[]) to authenticated, service_role;

grant select, insert, delete on discuss.reactions to authenticated, service_role;

-- Realtime for reactions (best-effort).
do $$
begin
  alter publication supabase_realtime add table discuss.reactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

commit;
