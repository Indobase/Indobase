-- Indobase CRM — native schema in TENANT Postgres.
-- Isolation is FORCE RLS + JWT project_ref (same model as Discuss). Never rely on app filters alone.

begin;

create schema if not exists crm;

create table if not exists crm.members (
  id            uuid primary key default gen_random_uuid(),
  gotrue_id     uuid not null,
  project_ref   text not null,
  email         text not null,
  display_name  text not null,
  avatar_url    text,
  role          text not null check (role in ('owner', 'admin', 'developer', 'viewer')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  unique (gotrue_id, project_ref)
);

create index if not exists crm_members_project_idx on crm.members (project_ref);

create table if not exists crm.companies (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  name         text not null,
  website      text,
  industry     text,
  created_by   uuid references crm.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists crm_companies_project_idx on crm.companies (project_ref);

create table if not exists crm.contacts (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  company_id   uuid references crm.companies (id) on delete set null,
  full_name    text not null,
  email        text,
  phone        text,
  title        text,
  created_by   uuid references crm.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists crm_contacts_project_idx on crm.contacts (project_ref);
create index if not exists crm_contacts_company_idx on crm.contacts (company_id);

create table if not exists crm.stages (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  name         text not null,
  position     int not null default 0,
  is_won       boolean not null default false,
  is_lost      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (project_ref, name)
);

create index if not exists crm_stages_project_idx on crm.stages (project_ref, position);

create table if not exists crm.deals (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  stage_id     uuid not null references crm.stages (id) on delete restrict,
  company_id   uuid references crm.companies (id) on delete set null,
  contact_id   uuid references crm.contacts (id) on delete set null,
  title        text not null,
  amount       numeric(18, 2),
  currency     text not null default 'INR',
  created_by   uuid references crm.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists crm_deals_project_idx on crm.deals (project_ref);
create index if not exists crm_deals_stage_idx on crm.deals (stage_id);

-- JWT helpers (project-scoped membership)
create or replace function crm.current_project_ref()
returns text
language sql
stable
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
  select nullif(current_setting('request.jwt.claim.project_ref', true), '');
$$;

create or replace function crm.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
  -- Fail closed without JWT project_ref (see 007_crm_multitenancy.sql).
  select m.id
  from crm.members m
  where crm.current_project_ref() is not null
    and m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = crm.current_project_ref();
$$;

alter table crm.members   enable row level security;
alter table crm.companies enable row level security;
alter table crm.contacts  enable row level security;
alter table crm.stages    enable row level security;
alter table crm.deals     enable row level security;

alter table crm.members   force row level security;
alter table crm.companies force row level security;
alter table crm.contacts  force row level security;
alter table crm.stages    force row level security;
alter table crm.deals     force row level security;

drop policy if exists crm_members_select on crm.members;
create policy crm_members_select on crm.members
  for select using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and exists (select 1 from crm.current_member_ids())
  );

drop policy if exists crm_companies_all on crm.companies;
create policy crm_companies_all on crm.companies
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_contacts_all on crm.contacts;
create policy crm_contacts_all on crm.contacts
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_stages_select on crm.stages;
create policy crm_stages_select on crm.stages
  for select using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  );

drop policy if exists crm_stages_write on crm.stages;
create policy crm_stages_write on crm.stages
  for all using (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role in ('owner', 'admin')
    )
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role in ('owner', 'admin')
    )
  );

drop policy if exists crm_deals_all on crm.deals;
create policy crm_deals_all on crm.deals
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

commit;
