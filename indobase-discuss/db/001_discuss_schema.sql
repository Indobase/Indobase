-- Indobase Discuss — native schema.
--
-- Replaces the Mattermost/Gameplan forks. Runs in the TENANT Postgres, so a project's
-- conversation lives beside its own data rather than in a third-party system that has to be
-- kept in sync.
--
-- ISOLATION IS ENFORCED BY RLS, NOT BY APPLICATION CODE. This is the whole reason for building
-- rather than forking. The Frappe Suite tenancy investigation found that its shared-site scoping
-- could not be trusted because Drive's own listing API issues raw queries that bypass the
-- permission layer entirely — a forgotten code path becomes a cross-tenant data leak. Postgres RLS
-- cannot be bypassed that way: the predicate is applied by the database on every query, including
-- ones nobody remembered to guard.
--
-- Read alongside: docs/INDOBASE-DISCUSS.md

begin;

create schema if not exists discuss;

-- ── Identity ────────────────────────────────────────────────────────────────────────────────────
-- Studio is the identity authority for the whole ecosystem. We store a projection of the user,
-- never credentials — there is no separate Discuss login, and there must never be one.
create table if not exists discuss.members (
  id            uuid primary key default gen_random_uuid(),
  gotrue_id     uuid not null,
  project_ref   text not null,
  email         text not null,
  display_name  text not null,
  avatar_url    text,
  -- Mirrors Studio's org role. Authorisation decisions belong to Studio; this is a cached copy
  -- for rendering and for the RLS predicates below.
  role          text not null check (role in ('owner', 'admin', 'developer', 'viewer')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  unique (gotrue_id, project_ref)
);

create index if not exists members_project_idx on discuss.members (project_ref);

-- ── Channels ────────────────────────────────────────────────────────────────────────────────────
create table if not exists discuss.channels (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  -- URL-safe, stable. Renaming `name` must never change this: permalinks outlive names.
  slug         text not null,
  name         text not null,
  topic        text,
  -- 'standard' = human conversation. 'activity' = platform event stream (deploys, payments,
  -- builds). Separating them lets the UI render activity as cards and stops event noise from
  -- burying discussion — the reason for building this rather than forking chat.
  kind         text not null default 'standard' check (kind in ('standard', 'activity')),
  is_private   boolean not null default false,
  created_by   uuid references discuss.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (project_ref, slug)
);

create index if not exists channels_project_idx on discuss.channels (project_ref) where archived_at is null;

create table if not exists discuss.channel_members (
  channel_id  uuid not null references discuss.channels (id) on delete cascade,
  member_id   uuid not null references discuss.members (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (channel_id, member_id)
);

create index if not exists channel_members_member_idx on discuss.channel_members (member_id);

-- ── Messages ────────────────────────────────────────────────────────────────────────────────────
create table if not exists discuss.messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references discuss.channels (id) on delete cascade,
  -- Denormalised from channels so RLS can filter without a join on the hottest table in the
  -- system. Kept honest by the trigger below, not by application discipline.
  project_ref  text not null,
  author_id    uuid references discuss.members (id) on delete set null,
  -- Null author + non-null event_type = a platform event (deploy, payment, build).
  event_type   text,
  event_data   jsonb,
  body         text,
  -- Threads are one level deep on purpose. Nested replies are where chat UIs become unreadable.
  parent_id    uuid references discuss.messages (id) on delete cascade,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  -- A message is either something a person said or something the platform did.
  constraint message_has_content check (
    (body is not null and length(trim(body)) > 0) or event_type is not null
  )
);

-- The index the channel view actually uses: newest-first within a channel, excluding replies.
create index if not exists messages_channel_created_idx
  on discuss.messages (channel_id, created_at desc)
  where deleted_at is null and parent_id is null;

create index if not exists messages_thread_idx
  on discuss.messages (parent_id, created_at)
  where deleted_at is null;

-- Full-text search. Generated column so it can never drift from the body.
alter table discuss.messages
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;

create index if not exists messages_search_idx on discuss.messages using gin (search_vector);

-- ── Read state ──────────────────────────────────────────────────────────────────────────────────
-- Storing a high-water mark rather than per-message read receipts: unread counts become a single
-- indexed count(*), and the table stays O(members × channels) instead of O(members × messages).
create table if not exists discuss.read_state (
  channel_id     uuid not null references discuss.channels (id) on delete cascade,
  member_id      uuid not null references discuss.members (id) on delete cascade,
  last_read_at   timestamptz not null default now(),
  primary key (channel_id, member_id)
);

-- ── Attachments ─────────────────────────────────────────────────────────────────────────────────
-- Bytes live in Indobase Storage; this table holds only the reference. One storage system for the
-- whole platform, not a second one bolted onto chat.
create table if not exists discuss.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references discuss.messages (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists attachments_message_idx on discuss.attachments (message_id);

-- ── Keep messages.project_ref honest ────────────────────────────────────────────────────────────
-- RLS on messages trusts project_ref. If application code could set it freely, a bug would become
-- a cross-tenant leak. The trigger derives it from the channel so the column cannot lie.
create or replace function discuss.set_message_project_ref()
returns trigger
language plpgsql
security definer
set search_path = discuss, pg_catalog
as $$
begin
  select c.project_ref into new.project_ref
  from discuss.channels c
  where c.id = new.channel_id;

  if new.project_ref is null then
    raise exception 'channel % does not exist', new.channel_id;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_set_project_ref on discuss.messages;
create trigger messages_set_project_ref
  before insert or update of channel_id on discuss.messages
  for each row execute function discuss.set_message_project_ref();

-- ── Row Level Security ──────────────────────────────────────────────────────────────────────────
-- Every table is FORCE-enabled: without FORCE, the table owner bypasses RLS, and migrations or
-- admin tooling connecting as the owner would silently see every tenant's data.
alter table discuss.members         enable row level security;
alter table discuss.channels        enable row level security;
alter table discuss.channel_members enable row level security;
alter table discuss.messages        enable row level security;
alter table discuss.read_state      enable row level security;
alter table discuss.attachments     enable row level security;

alter table discuss.members         force row level security;
alter table discuss.channels        force row level security;
alter table discuss.channel_members force row level security;
alter table discuss.messages        force row level security;
alter table discuss.read_state      force row level security;
alter table discuss.attachments     force row level security;

-- The caller's membership rows, derived from the JWT. Marked stable so Postgres can cache it
-- within a statement rather than re-evaluating per row.
-- row_security=off: FORCE RLS on members would otherwise re-enter this function via policies.
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
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

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

-- Membership of the CHANNEL is the boundary, not membership of the project. A private channel must
-- stay private to project peers too.
drop policy if exists members_self_project on discuss.members;
create policy members_self_project on discuss.members
  for select using (
    project_ref in (select discuss.my_project_refs())
  );

drop policy if exists channels_visible on discuss.channels;
create policy channels_visible on discuss.channels
  for select using (
    id in (select discuss.my_channel_ids())
    or (not is_private and project_ref in (select discuss.my_project_refs()))
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

-- Viewers are read-only across the ecosystem; that must hold here too.
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

-- Authors edit their own words. Nobody edits anyone else's.
drop policy if exists messages_update_own on discuss.messages;
create policy messages_update_own on discuss.messages
  for update using (author_id in (select discuss.current_member_ids()))
  with check (author_id in (select discuss.current_member_ids()));

drop policy if exists read_state_own on discuss.read_state;
create policy read_state_own on discuss.read_state
  for all using (member_id in (select discuss.current_member_ids()))
  with check (member_id in (select discuss.current_member_ids()));

drop policy if exists attachments_follow_message on discuss.attachments;
create policy attachments_follow_message on discuss.attachments
  for select using (
    message_id in (select id from discuss.messages)
  );

commit;
