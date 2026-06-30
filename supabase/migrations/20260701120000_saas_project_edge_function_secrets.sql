-- Edge function secrets for tenant data-plane repair and Studio settings UI.
create table if not exists saas.project_edge_function_secrets (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null references saas.projects(ref) on delete cascade,
  name text not null,
  value_enc text not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_ref, name)
);

create index if not exists project_edge_function_secrets_project_ref_idx
  on saas.project_edge_function_secrets (project_ref);

select saas.grant_studio_access();
