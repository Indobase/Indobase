-- Indobase Video P0 — cloud project docs + AI generation metering.

alter table saas.organizations
  add column if not exists video_ai_used integer not null default 0;

comment on column saas.organizations.video_ai_used is
  'Count of Video AI generate/TTS credits consumed against videoAiLimit entitlements.';

create table if not exists saas.video_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references saas.organizations(id) on delete cascade,
  project_ref text not null references saas.projects(ref) on delete cascade,
  owner_gotrue_id uuid not null,
  title text not null default 'Untitled video',
  doc jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_video_projects_ref_owner_idx
  on saas.video_projects (project_ref, owner_gotrue_id, updated_at desc);

create index if not exists saas_video_projects_org_idx
  on saas.video_projects (organization_id);

comment on table saas.video_projects is
  'Indobase Video editor documents (timeline JSON). Media blobs stay client-side for P0.';

-- Optional asset metadata (URLs / names). Blob bytes not stored in control-plane DB.
create table if not exists saas.video_assets (
  id uuid primary key default gen_random_uuid(),
  video_project_id uuid not null references saas.video_projects(id) on delete cascade,
  project_ref text not null references saas.projects(ref) on delete cascade,
  owner_gotrue_id uuid not null,
  kind text not null check (kind in ('video', 'audio', 'image')),
  name text not null default '',
  storage_path text null,
  public_url text null,
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_video_assets_project_idx
  on saas.video_assets (video_project_id);
