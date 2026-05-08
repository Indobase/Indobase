-- SaaS feature tables for self-hosted multi-tenant Studio (Model A: single DB + RLS).
--
-- Adds first-class persistence for features that on Supabase Cloud are exposed via
-- the Platform API but on self-hosted previously returned empty data:
--   - saas.audit_logs                 (org / project event log)
--   - saas.custom_domains             (per-project custom hostnames)
--   - saas.third_party_auth_integrations (per-project external JWT issuers)
--
-- We also add a `ssl_enforced` flag on saas.projects so SSL enforcement toggles
-- have a real backing store (the actual TLS termination is operator-managed via
-- Traefik / load-balancer, so the value is advisory but persisted per-project).
--
-- All tables are tenant-scoped and protected with RLS (project_ref or
-- organization membership) to prevent cross-tenant reads on the shared DB.

create schema if not exists saas;

-- ---------------------------------------------------------------------------
-- saas.projects: ssl_enforced flag (advisory in Model A)
-- ---------------------------------------------------------------------------
do $saas_features_projects$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'ssl_enforced'
  ) then
    alter table saas.projects add column ssl_enforced boolean not null default false;
  end if;
end
$saas_features_projects$;

-- ---------------------------------------------------------------------------
-- saas.audit_logs
-- ---------------------------------------------------------------------------
create table if not exists saas.audit_logs (
  id bigserial primary key,
  organization_id integer null,
  project_ref text null,
  actor_gotrue_id uuid null,
  actor_email text null,
  action text not null,
  target_type text not null,
  target_description text null,
  metadata jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_logs_org_id_idx on saas.audit_logs (organization_id, occurred_at desc);
create index if not exists audit_logs_project_ref_idx on saas.audit_logs (project_ref, occurred_at desc);
create index if not exists audit_logs_actor_idx on saas.audit_logs (actor_gotrue_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- saas.custom_domains
-- ---------------------------------------------------------------------------
create table if not exists saas.custom_domains (
  id bigserial primary key,
  project_ref text not null,
  hostname text not null,
  status text not null default 'pending_verification', -- pending_verification|active|failed|disabled
  ownership_verification jsonb not null default '[]'::jsonb,
  ssl jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_domains_project_hostname_idx
  on saas.custom_domains (project_ref, hostname);
create index if not exists custom_domains_hostname_idx
  on saas.custom_domains (hostname);

-- ---------------------------------------------------------------------------
-- saas.third_party_auth_integrations
-- ---------------------------------------------------------------------------
create table if not exists saas.third_party_auth_integrations (
  id bigserial primary key,
  project_ref text not null,
  type text not null, -- oidc|jwks|firebase|auth0|aws_cognito|azure_ad
  oidc_issuer_url text null,
  jwks_url text null,
  custom_jwks jsonb null,
  resolved_jwks jsonb null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists third_party_auth_project_idx
  on saas.third_party_auth_integrations (project_ref);

-- ---------------------------------------------------------------------------
-- RLS: only the project's owning organization members can read/write
-- ---------------------------------------------------------------------------
-- Helper that checks org membership for the given (project_ref, gotrue_id).
create or replace function saas.is_member_of_project(_project_ref text, _gotrue_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from saas.projects p
    join saas.organization_members m on m.organization_id = p.organization_id
    where p.ref = _project_ref
      and m.gotrue_id = _gotrue_id
  );
$$;

create or replace function saas.is_member_of_org(_organization_id integer, _gotrue_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from saas.organization_members m
    where m.organization_id = _organization_id
      and m.gotrue_id = _gotrue_id
  );
$$;

-- saas.audit_logs RLS: members can read their org / project events.
alter table saas.audit_logs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'audit_logs' and policyname = 'audit_logs_member_select') then
    create policy audit_logs_member_select on saas.audit_logs
      for select
      using (
        (organization_id is not null
          and saas.is_member_of_org(organization_id, nullif(current_setting('app.uid', true), '')::uuid))
        or
        (project_ref is not null
          and saas.is_member_of_project(project_ref, nullif(current_setting('app.uid', true), '')::uuid))
      );
  end if;
end
$$;

-- saas.custom_domains RLS: scoped to project membership.
alter table saas.custom_domains enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'custom_domains' and policyname = 'custom_domains_member_all') then
    create policy custom_domains_member_all on saas.custom_domains
      for all
      using (saas.is_member_of_project(project_ref, nullif(current_setting('app.uid', true), '')::uuid))
      with check (saas.is_member_of_project(project_ref, nullif(current_setting('app.uid', true), '')::uuid));
  end if;
end
$$;

-- saas.third_party_auth_integrations RLS.
alter table saas.third_party_auth_integrations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'third_party_auth_integrations' and policyname = 'third_party_auth_member_all') then
    create policy third_party_auth_member_all on saas.third_party_auth_integrations
      for all
      using (saas.is_member_of_project(project_ref, nullif(current_setting('app.uid', true), '')::uuid))
      with check (saas.is_member_of_project(project_ref, nullif(current_setting('app.uid', true), '')::uuid));
  end if;
end
$$;

-- Grants for service-role + authenticated paths used by Studio handlers.
grant usage on schema saas to public;
grant select, insert, update, delete on saas.audit_logs to public;
grant select, insert, update, delete on saas.custom_domains to public;
grant select, insert, update, delete on saas.third_party_auth_integrations to public;
grant usage, select on sequence saas.audit_logs_id_seq to public;
grant usage, select on sequence saas.custom_domains_id_seq to public;
grant usage, select on sequence saas.third_party_auth_integrations_id_seq to public;

-- ---------------------------------------------------------------------------
-- Realtime tenant isolation (channel-topic prefix)
--
-- The shared Realtime tenant `realtime-dev` serves every Indobase project
-- on this Postgres instance. To prevent cross-tenant message leakage between
-- two clients connecting with different project_refs but subscribing to the
-- same logical topic name (e.g. "lobby"), we install:
--   1. A trigger on `realtime.messages` that rejects writes whose `topic`
--      doesn't start with the caller's project_ref.
--   2. An RLS policy that hides messages whose topic doesn't match the
--      caller's project_ref claim.
--
-- Customer apps using supabase-js automatically include the project_ref claim
-- in their JWT (issued by createProject); they MUST namespace channel topics
-- as `<project_ref>:<your_topic>` (Indobase Studio's Realtime Inspector does
-- this automatically). This is documented in our SaaS readiness notes.
-- ---------------------------------------------------------------------------

do $realtime_isolation$
declare
  has_messages boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'realtime' and table_name = 'messages'
  ) into has_messages;

  if not has_messages then
    -- Realtime hasn't booted yet; skip — the migrator will pick this up next run.
    return;
  end if;

  -- Drop and recreate the trigger so we can iterate on the rule without
  -- requiring operators to manually drop old versions.
  execute 'drop trigger if exists indobase_enforce_topic_project_ref on realtime.messages';

  execute $func$
    create or replace function realtime.indobase_enforce_topic_project_ref()
    returns trigger
    language plpgsql
    security definer
    as $body$
    declare
      ref text;
      prefix text;
    begin
      ref := app.project_ref();
      if ref is null then
        return new; -- no tenant context; let RLS / role checks handle it
      end if;
      prefix := ref || ':';
      if new.topic is null or position(prefix in new.topic) <> 1 then
        raise exception 'Realtime channel topic must be namespaced with project_ref ("%:<topic>"). Topic was: "%"',
          ref, new.topic
          using errcode = '42501';
      end if;
      return new;
    end;
    $body$;
  $func$;

  execute 'create trigger indobase_enforce_topic_project_ref'
       || ' before insert or update on realtime.messages'
       || ' for each row execute function realtime.indobase_enforce_topic_project_ref()';

  -- Add an RLS policy that filters reads by topic prefix.
  -- We don't drop existing Realtime policies; we just add ours alongside.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'indobase_isolate_topic_by_project_ref'
  ) then
    execute 'alter table realtime.messages enable row level security';
    execute $pol$
      create policy indobase_isolate_topic_by_project_ref on realtime.messages
        for select
        using (
          app.project_ref() is null
          or topic like (app.project_ref() || ':%')
        )
    $pol$;
  end if;
end
$realtime_isolation$;
