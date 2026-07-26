-- Indobase Design — schema.
--
-- Multi-tenant from the start (the upstream editor was single-user on Cloudflare D1). Every design
-- belongs to a Studio user and a project, so the same isolation rules as the rest of the suite apply
-- and a design can later be tied to project data (products/prices) for data-merged templates.

create schema if not exists design;

-- ── Designs ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists design.designs (
  id            uuid primary key default gen_random_uuid(),
  -- Studio identity. gotrue_id is the user; project_ref scopes to an Indobase project.
  gotrue_id     uuid        not null,
  project_ref   text        not null,
  org_slug      text        null,

  name          text        not null default 'Untitled design',
  -- Fabric.js canvas state. JSON (not binary) — this is what makes AI drafting and
  -- business-data merge possible, and why we moved off Penpot's binary format.
  canvas_json   jsonb       not null default '{}'::jsonb,
  width         integer     not null default 1080,
  height        integer     not null default 1080,
  thumbnail_url text        null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Dashboard lists a user's designs within a project, newest first.
create index if not exists designs_owner_idx
  on design.designs (project_ref, gotrue_id, updated_at desc);

-- ── Pages (multi-page designs: carousels, decks) ─────────────────────────────────────────────────
create table if not exists design.pages (
  id          uuid primary key default gen_random_uuid(),
  design_id   uuid        not null references design.designs (id) on delete cascade,
  title       text        not null default 'Page',
  canvas_json jsonb       not null default '{}'::jsonb,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists pages_design_idx
  on design.pages (design_id, sort_order);

-- ── Templates ────────────────────────────────────────────────────────────────────────────────────
-- Global (gotrue_id null) = shipped Indobase templates. Per-user rows allow "save as template"
-- later without a schema change.
create table if not exists design.templates (
  id            uuid primary key default gen_random_uuid(),
  gotrue_id     uuid        null,
  slug          text        not null unique,
  name          text        not null,
  category      text        not null default 'social',
  canvas_json   jsonb       not null,
  width         integer     not null,
  height        integer     not null,
  thumbnail_url text        null,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists templates_listing_idx
  on design.templates (category, sort_order);

-- ── Uploads ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists design.uploads (
  id          uuid primary key default gen_random_uuid(),
  gotrue_id   uuid        not null,
  project_ref text        not null,
  mime_type   text        not null,
  byte_size   integer     not null,
  storage_key text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists uploads_owner_idx
  on design.uploads (project_ref, gotrue_id, created_at desc);

-- Keep updated_at honest without relying on the app layer.
create or replace function design.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists designs_touch_updated_at on design.designs;
create trigger designs_touch_updated_at
  before update on design.designs
  for each row execute function design.touch_updated_at();
