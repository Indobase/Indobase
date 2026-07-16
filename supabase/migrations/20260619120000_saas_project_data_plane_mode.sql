-- Per-project data plane mode: isolated Docker stack vs shared gateway (Free tier).
-- isolated_stack: full per-tenant compose + Traefik host (Pro+ default)
-- shared_gateway: DB on shared Postgres + slim sidecars; routed via tenant multiplexer + api.indobase.in
-- model_a: legacy single shared database (no per-project DB)

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'data_plane_mode'
  ) then
    alter table saas.projects
      add column data_plane_mode text not null default 'isolated_stack'
        check (data_plane_mode in ('isolated_stack', 'shared_gateway', 'model_a'));
  end if;
end
$$;

comment on column saas.projects.data_plane_mode is
  'isolated_stack = per-tenant compose + ref.domain; shared_gateway = slim sidecars + api.indobase.in; model_a = legacy shared DB';

-- Existing rows with connection_string_enc → isolated_stack; without → model_a
update saas.projects
set data_plane_mode = case
  when coalesce(trim(connection_string_enc), '') <> '' or coalesce(trim(connection_string), '') <> ''
    then 'isolated_stack'
  else 'model_a'
end
where data_plane_mode = 'isolated_stack';

-- Free orgs with dedicated DBs use shared gateway (no per-tenant Traefik).
update saas.projects p
set data_plane_mode = 'shared_gateway'
from saas.organizations o
where o.id = p.organization_id
  and lower(o.plan) in ('free', 'platform')
  and (
    coalesce(trim(p.connection_string_enc), '') <> ''
    or coalesce(trim(p.connection_string), '') <> ''
  )
  and p.data_plane_mode <> 'shared_gateway';
