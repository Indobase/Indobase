-- Indobase Discuss — uploads support, notifications, group DMs, archive.
-- Additive and idempotent. Applied after 001–004 by discuss/ensure.

begin;

-- Group DMs share the private channel model with an explicit kind.
alter table discuss.channels drop constraint if exists channels_kind_check;
alter table discuss.channels
  add constraint channels_kind_check
  check (kind in ('standard', 'activity', 'direct', 'group'));

-- ── Notifications ───────────────────────────────────────────────────────────────────────────────
create table if not exists discuss.notifications (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references discuss.members (id) on delete cascade,
  project_ref  text not null,
  channel_id   uuid references discuss.channels (id) on delete cascade,
  message_id   uuid references discuss.messages (id) on delete cascade,
  kind         text not null check (kind in ('mention', 'dm', 'reply', 'system')),
  title        text not null,
  body         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_member_unread_idx
  on discuss.notifications (member_id, created_at desc)
  where read_at is null;

alter table discuss.notifications enable row level security;
alter table discuss.notifications force row level security;

drop policy if exists notifications_own on discuss.notifications;
create policy notifications_own on discuss.notifications
  for all using (member_id in (select discuss.current_member_ids()))
  with check (member_id in (select discuss.current_member_ids()));

-- Attachment insert: authors may attach to messages they can write.
drop policy if exists attachments_insert on discuss.attachments;
create policy attachments_insert on discuss.attachments
  for insert with check (
    message_id in (
      select m.id from discuss.messages m
      where m.author_id in (select discuss.current_member_ids())
    )
  );

drop policy if exists attachments_delete_own on discuss.attachments;
create policy attachments_delete_own on discuss.attachments
  for delete using (
    message_id in (
      select m.id from discuss.messages m
      where m.author_id in (select discuss.current_member_ids())
    )
  );

grant select, insert, delete on discuss.attachments to authenticated, service_role;
grant select, insert, update, delete on discuss.notifications to authenticated, service_role;

-- ── Storage bucket for Discuss uploads ──────────────────────────────────────────────────────────
-- Bytes live in Indobase Storage; discuss.attachments only stores the reference.
-- Best-effort: tenants without Storage yet still get the rest of this migration.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'discuss',
    'discuss',
    false,
    26214400, -- 25 MiB
    array[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Authenticated users may manage objects under discuss/{their-gotrue-id}/…
  drop policy if exists discuss_storage_select on storage.objects;
  create policy discuss_storage_select on storage.objects
    for select to authenticated
    using (bucket_id = 'discuss');

  drop policy if exists discuss_storage_insert on storage.objects;
  create policy discuss_storage_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'discuss'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists discuss_storage_update on storage.objects;
  create policy discuss_storage_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'discuss'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists discuss_storage_delete on storage.objects;
  create policy discuss_storage_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'discuss'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when undefined_table then null;
  when undefined_function then null;
end
$$;

-- ── Archive / unarchive ─────────────────────────────────────────────────────────────────────────
create or replace function discuss.archive_channel(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_me uuid;
  v_role text;
  v_project text;
  v_kind text;
begin
  select c.project_ref, c.kind into v_project, v_kind
  from discuss.channels c where c.id = p_channel_id;
  if v_project is null then raise exception 'channel not found'; end if;
  if v_kind = 'activity' then raise exception 'cannot archive the activity channel'; end if;

  select m.id, m.role into v_me, v_role
  from discuss.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = v_project
  limit 1;

  if v_me is null then raise exception 'not a Discuss member of this project'; end if;
  if v_role not in ('owner', 'admin', 'developer') then
    raise exception 'insufficient role to archive channels';
  end if;

  update discuss.channels
  set archived_at = coalesce(archived_at, now())
  where id = p_channel_id;

  return p_channel_id;
end;
$$;

create or replace function discuss.unarchive_channel(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_me uuid;
  v_role text;
  v_project text;
begin
  select c.project_ref into v_project from discuss.channels c where c.id = p_channel_id;
  if v_project is null then raise exception 'channel not found'; end if;

  select m.id, m.role into v_me, v_role
  from discuss.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = v_project
  limit 1;

  if v_me is null then raise exception 'not a Discuss member of this project'; end if;
  if v_role not in ('owner', 'admin', 'developer') then
    raise exception 'insufficient role to unarchive channels';
  end if;

  update discuss.channels set archived_at = null where id = p_channel_id;
  return p_channel_id;
end;
$$;

revoke all on function discuss.archive_channel(uuid) from public;
revoke all on function discuss.unarchive_channel(uuid) from public;
grant execute on function discuss.archive_channel(uuid) to authenticated, service_role;
grant execute on function discuss.unarchive_channel(uuid) to authenticated, service_role;

-- ── Group DM ────────────────────────────────────────────────────────────────────────────────────
create or replace function discuss.open_group_dm(
  p_project_ref text,
  p_member_ids  uuid[],
  p_name        text default null
)
returns uuid
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_me uuid;
  v_role text;
  v_ids uuid[];
  v_slug text;
  v_channel uuid;
  v_name text;
  v_id uuid;
begin
  select m.id, m.role into v_me, v_role
  from discuss.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = p_project_ref
  limit 1;

  if v_me is null then raise exception 'not a Discuss member of this project'; end if;
  if v_role = 'viewer' then raise exception 'viewers cannot start group messages'; end if;

  -- Include caller, dedupe, require at least one other person.
  select array_agg(distinct x order by x) into v_ids
  from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), v_me)) as t(x);

  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'pick at least one other member';
  end if;
  if array_length(v_ids, 1) = 2 then
    -- Delegate to 1:1 so we do not duplicate DM rows.
    return discuss.open_direct_channel(
      p_project_ref,
      case when v_ids[1] = v_me then v_ids[2] else v_ids[1] end
    );
  end if;

  -- Stable slug from sorted member ids.
  v_slug := 'grp-' || md5(array_to_string(v_ids, ','));

  select c.id into v_channel
  from discuss.channels c
  where c.project_ref = p_project_ref and c.slug = v_slug and c.kind = 'group'
  limit 1;

  if v_channel is null then
    select string_agg(m.display_name, ', ' order by m.display_name)
      into v_name
    from discuss.members m
    where m.id = any(v_ids) and m.id <> v_me;

    insert into discuss.channels (project_ref, slug, name, topic, kind, is_private, created_by)
    values (
      p_project_ref,
      left(v_slug, 64),
      left(coalesce(nullif(trim(p_name), ''), nullif(v_name, ''), 'Group message'), 80),
      null,
      'group',
      true,
      v_me
    )
    returning id into v_channel;
  elsif nullif(trim(p_name), '') is not null then
    update discuss.channels set name = left(trim(p_name), 80) where id = v_channel;
  end if;

  foreach v_id in array v_ids loop
    insert into discuss.channel_members (channel_id, member_id)
    values (v_channel, v_id)
    on conflict do nothing;
  end loop;

  return v_channel;
end;
$$;

revoke all on function discuss.open_group_dm(text, uuid[], text) from public;
grant execute on function discuss.open_group_dm(text, uuid[], text) to authenticated, service_role;

-- ── Mention / DM notification fan-out ───────────────────────────────────────────────────────────
create or replace function discuss.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
declare
  v_channel_kind text;
  v_author_name text;
  v_member record;
  v_snippet text;
begin
  if new.author_id is null or new.event_type is not null then
    return new;
  end if;

  select c.kind into v_channel_kind
  from discuss.channels c where c.id = new.channel_id;

  select m.display_name into v_author_name from discuss.members m where m.id = new.author_id;
  v_snippet := left(coalesce(new.body, ''), 140);

  if v_channel_kind in ('direct', 'group') then
    for v_member in
      select cm.member_id
      from discuss.channel_members cm
      where cm.channel_id = new.channel_id
        and cm.member_id is distinct from new.author_id
    loop
      insert into discuss.notifications (member_id, project_ref, channel_id, message_id, kind, title, body)
      values (
        v_member.member_id,
        new.project_ref,
        new.channel_id,
        new.id,
        'dm',
        coalesce(v_author_name, 'Someone') || ' messaged you',
        v_snippet
      );
    end loop;
  end if;

  -- @Mentions: match display names case-insensitively as whole tokens after @.
  for v_member in
    select m.id, m.display_name
    from discuss.members m
    join discuss.channel_members cm on cm.member_id = m.id and cm.channel_id = new.channel_id
    where m.id is distinct from new.author_id
      and new.body ilike '%@' || m.display_name || '%'
  loop
    insert into discuss.notifications (member_id, project_ref, channel_id, message_id, kind, title, body)
    values (
      v_member.id,
      new.project_ref,
      new.channel_id,
      new.id,
      'mention',
      coalesce(v_author_name, 'Someone') || ' mentioned you',
      v_snippet
    );
  end loop;

  -- Thread replies notify the root author.
  if new.parent_id is not null then
    insert into discuss.notifications (member_id, project_ref, channel_id, message_id, kind, title, body)
    select
      root.author_id,
      new.project_ref,
      new.channel_id,
      new.id,
      'reply',
      coalesce(v_author_name, 'Someone') || ' replied to your message',
      v_snippet
    from discuss.messages root
    where root.id = new.parent_id
      and root.author_id is not null
      and root.author_id is distinct from new.author_id;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_notify on discuss.messages;
create trigger messages_notify
  after insert on discuss.messages
  for each row execute function discuss.notify_on_message();

do $$
begin
  alter publication supabase_realtime add table discuss.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

commit;
