-- SaaS control-plane hardening: tenant isolation, constraints, and indexes
-- Date: 2026-04-21
-- Notes:
-- - Enables RLS on saas.* without FORCE; current owner (supabase_admin) bypasses RLS to avoid breaking Studio API.
-- - After API is updated to set an app-level GUC (see notes), you may optionally FORCE RLS.
-- - Adds FKs, CHECKs, slug sync trigger, and search indexes.

create schema if not exists saas;
create extension if not exists pg_trgm with schema public;

-- 1) Foreign keys with ON DELETE CASCADE
do $$
begin
  begin
    alter table if exists saas.organization_members
      add constraint organization_members_org_fk
      foreign key (organization_id) references saas.organizations(id) on delete cascade;
  exception when duplicate_object then null;
  end;

  begin
    alter table if exists saas.organization_invites
      add constraint organization_invites_org_fk
      foreign key (organization_id) references saas.organizations(id) on delete cascade;
  exception when duplicate_object then null;
  end;

  begin
    alter table if exists saas.projects
      add constraint projects_org_fk
      foreign key (organization_id) references saas.organizations(id) on delete cascade;
  exception when duplicate_object then null;
  end;
end $$;

-- 2) CHECK constraints to lock enums
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_plan_check'
  ) then
    alter table saas.organizations
      add constraint organizations_plan_check
      check (plan in ('free','pro','team','enterprise','platform'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_members_role_check'
  ) then
    alter table saas.organization_members
      add constraint organization_members_role_check
      check (role in ('owner','admin','developer','viewer'));
  end if;
end $$;

-- 3) Keep projects.organization_slug consistent with organizations.slug
create or replace function saas.sync_project_org_slug()
returns trigger
language plpgsql
as $$
begin
  select o.slug into new.organization_slug from saas.organizations o where o.id = new.organization_id;
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'saas_projects_sync_slug'
  ) then
    create trigger saas_projects_sync_slug
      before insert or update of organization_id
      on saas.projects
      for each row
      execute function saas.sync_project_org_slug();
  end if;
end $$;

-- 4) Search and join performance indexes
create index if not exists projects_org_id_idx on saas.projects (organization_id);
create index if not exists organization_invites_org_id_idx on saas.organization_invites (organization_id);
create index if not exists organization_members_org_id_idx on saas.organization_members (organization_id);
create index if not exists organization_members_gotrue_id_idx on saas.organization_members (gotrue_id);

-- ILIKE search optimization
create index if not exists projects_name_trgm_idx on saas.projects using gin (name gin_trgm_ops);
create index if not exists projects_ref_trgm_idx  on saas.projects using gin (ref  gin_trgm_ops);

-- Avoid duplicate pending invites per email per org
create unique index if not exists organization_invites_unique_pending
  on saas.organization_invites (organization_id, lower(email))
  where accepted_at is null;

-- Only one PERSONAL org per owner (matches default workspace behavior)
create unique index if not exists organizations_one_personal_per_owner
  on saas.organizations (owner_gotrue_id)
  where kind = 'PERSONAL';

-- Enforce scheme for projects.connection_string when provided
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_connection_string_scheme_check'
  ) then
    alter table saas.projects
      add constraint projects_connection_string_scheme_check
      check (
        connection_string is null
        or connection_string ~* '^(postgres(ql)?://)'
      );
  end if;
end $$;

-- 5) Helper: resolve current user id from app GUC or PostgREST JWT
create or replace function saas.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.uid', true), '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  )
$$;

-- 6) Enable Row Level Security (no FORCE yet)
alter table if exists saas.organizations         enable row level security;
alter table if exists saas.organization_members  enable row level security;
alter table if exists saas.organization_invites  enable row level security;
alter table if exists saas.projects              enable row level security;
alter table if exists saas.profiles              enable row level security;

-- 7) RLS Policies (membership-based)
-- Organizations
drop policy if exists saas_org_select on saas.organizations;
create policy saas_org_select
  on saas.organizations
  for select
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = id
        and m.gotrue_id = saas.current_user_id()
    )
  );

drop policy if exists saas_org_insert on saas.organizations;
create policy saas_org_insert
  on saas.organizations
  for insert
  with check (saas.current_user_id() is not null);

drop policy if exists saas_org_update on saas.organizations;
create policy saas_org_update
  on saas.organizations
  for update
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin')
    )
  );

drop policy if exists saas_org_delete on saas.organizations;
create policy saas_org_delete
  on saas.organizations
  for delete
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = id
        and m.gotrue_id = saas.current_user_id()
        and m.role = 'owner'
    )
  );

-- Organization members
drop policy if exists saas_members_select on saas.organization_members;
create policy saas_members_select
  on saas.organization_members
  for select
  using (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
    )
  );

drop policy if exists saas_members_modify on saas.organization_members;
create policy saas_members_modify
  on saas.organization_members
  for all
  using (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
        and me.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
        and me.role in ('owner','admin')
    )
  );

-- Organization invites
drop policy if exists saas_invites_select on saas.organization_invites;
create policy saas_invites_select
  on saas.organization_invites
  for select
  using (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
    )
  );

drop policy if exists saas_invites_modify on saas.organization_invites;
create policy saas_invites_modify
  on saas.organization_invites
  for all
  using (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
        and me.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from saas.organization_members me
      where me.organization_id = organization_id
        and me.gotrue_id = saas.current_user_id()
        and me.role in ('owner','admin')
    )
  );

-- Projects
drop policy if exists saas_projects_select on saas.projects;
create policy saas_projects_select
  on saas.projects
  for select
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = organization_id
        and m.gotrue_id = saas.current_user_id()
    )
  );

drop policy if exists saas_projects_insert on saas.projects;
create policy saas_projects_insert
  on saas.projects
  for insert
  with check (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = organization_id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin','developer')
    )
  );

drop policy if exists saas_projects_update on saas.projects;
create policy saas_projects_update
  on saas.projects
  for update
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = organization_id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = organization_id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin')
    )
  );

drop policy if exists saas_projects_delete on saas.projects;
create policy saas_projects_delete
  on saas.projects
  for delete
  using (
    exists (
      select 1 from saas.organization_members m
      where m.organization_id = organization_id
        and m.gotrue_id = saas.current_user_id()
        and m.role in ('owner','admin')
    )
  );

-- Profiles (self-owned)
drop policy if exists saas_profiles_select on saas.profiles;
create policy saas_profiles_select
  on saas.profiles
  for select
  using (gotrue_id = saas.current_user_id());

drop policy if exists saas_profiles_modify on saas.profiles;
create policy saas_profiles_modify
  on saas.profiles
  for all
  using (gotrue_id = saas.current_user_id())
  with check (gotrue_id = saas.current_user_id());

-- 8) Ensure the org owner is also present in organization_members (seed on insert)
create or replace function saas.seed_owner_membership()
returns trigger
language plpgsql
as $$
begin
  insert into saas.organization_members (organization_id, gotrue_id, role)
  values (new.id, new.owner_gotrue_id, 'owner')
  on conflict (organization_id, gotrue_id) do update
    set role = excluded.role,
        updated_at = now();
  return new;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'saas_seed_owner_membership') then
    create trigger saas_seed_owner_membership
      after insert on saas.organizations
      for each row
      execute function saas.seed_owner_membership();
  end if;
end $$;

-- Backfill existing organizations to ensure owner membership exists
insert into saas.organization_members (organization_id, gotrue_id, role)
select o.id, o.owner_gotrue_id, 'owner'
from saas.organizations o
left join saas.organization_members m
  on m.organization_id = o.id and m.gotrue_id = o.owner_gotrue_id
where m.organization_id is null;

-- Optional (future hardening):
-- To enforce policies even for table owners (e.g., supabase_admin), uncomment:
-- alter table saas.organizations        force row level security;
-- alter table saas.organization_members force row level security;
-- alter table saas.organization_invites force row level security;
-- alter table saas.projects             force row level security;
-- alter table saas.profiles             force row level security;

-- 9) Ownership safety: prevent deleting/demoting the last owner in an org
create or replace function saas.prevent_last_owner()
returns trigger
language plpgsql
as $$
declare
  owner_count int;
  target_org_id int;
begin
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
    target_org_id := old.organization_id;
    select count(*) into owner_count
    from saas.organization_members
    where organization_id = target_org_id
      and gotrue_id <> old.gotrue_id
      and role = 'owner';
    if owner_count = 0 then
      raise exception 'Cannot remove the last owner from organization %', target_org_id using errcode = 'P0001';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      target_org_id := new.organization_id;
      select count(*) into owner_count
      from saas.organization_members
      where organization_id = target_org_id
        and gotrue_id <> old.gotrue_id
        and role = 'owner';
      if owner_count = 0 then
        raise exception 'Cannot demote the last owner from organization %', target_org_id using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  return new;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'saas_prevent_last_owner_delete') then
    create trigger saas_prevent_last_owner_delete
      before delete on saas.organization_members
      for each row execute function saas.prevent_last_owner();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'saas_prevent_last_owner_update') then
    create trigger saas_prevent_last_owner_update
      before update of role on saas.organization_members
      for each row execute function saas.prevent_last_owner();
  end if;
end $$;

