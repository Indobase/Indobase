-- Fix saas RLS infinite recursion: membership checks must bypass RLS via SECURITY DEFINER.
-- Policies should call saas.is_member_of_org / saas.has_org_role / saas.is_member_of_project only.

create or replace function saas.is_member_of_org(_organization_id integer, _gotrue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and exists (
      select 1
      from saas.organization_members m
      where m.organization_id = _organization_id
        and m.gotrue_id = _gotrue_id
    );
$$;

create or replace function saas.has_org_role(_organization_id integer, _gotrue_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and exists (
      select 1
      from saas.organization_members m
      where m.organization_id = _organization_id
        and m.gotrue_id = _gotrue_id
        and m.role = any (_roles)
    );
$$;

create or replace function saas.is_member_of_project(_project_ref text, _gotrue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and _project_ref is not null
    and exists (
      select 1
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = _project_ref
        and m.gotrue_id = _gotrue_id
    );
$$;

revoke all on function saas.is_member_of_org(integer, uuid) from public;
revoke all on function saas.has_org_role(integer, uuid, text[]) from public;
revoke all on function saas.is_member_of_project(text, uuid) from public;
grant execute on function saas.is_member_of_org(integer, uuid) to authenticated, service_role, postgres;
grant execute on function saas.has_org_role(integer, uuid, text[]) to authenticated, service_role, postgres;
grant execute on function saas.is_member_of_project(text, uuid) to authenticated, service_role, postgres;

-- Organizations
drop policy if exists saas_org_select on saas.organizations;
create policy saas_org_select on saas.organizations
  for select
  using (saas.is_member_of_org(id, saas.current_user_id()));

drop policy if exists saas_org_insert on saas.organizations;
create policy saas_org_insert on saas.organizations
  for insert
  with check (saas.current_user_id() is not null);

drop policy if exists saas_org_update on saas.organizations;
create policy saas_org_update on saas.organizations
  for update
  using (saas.has_org_role(id, saas.current_user_id(), array['owner', 'admin']))
  with check (saas.has_org_role(id, saas.current_user_id(), array['owner', 'admin']));

drop policy if exists saas_org_delete on saas.organizations;
create policy saas_org_delete on saas.organizations
  for delete
  using (saas.has_org_role(id, saas.current_user_id(), array['owner']));

-- Organization members
drop policy if exists saas_members_select on saas.organization_members;
create policy saas_members_select on saas.organization_members
  for select
  using (saas.is_member_of_org(organization_id, saas.current_user_id()));

drop policy if exists saas_members_modify on saas.organization_members;
create policy saas_members_modify on saas.organization_members
  for all
  using (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']))
  with check (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']));

-- Organization invites
drop policy if exists saas_invites_select on saas.organization_invites;
create policy saas_invites_select on saas.organization_invites
  for select
  using (saas.is_member_of_org(organization_id, saas.current_user_id()));

drop policy if exists saas_invites_modify on saas.organization_invites;
create policy saas_invites_modify on saas.organization_invites
  for all
  using (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']))
  with check (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']));

-- Projects
drop policy if exists saas_projects_select on saas.projects;
create policy saas_projects_select on saas.projects
  for select
  using (saas.is_member_of_org(organization_id, saas.current_user_id()));

drop policy if exists saas_projects_insert on saas.projects;
create policy saas_projects_insert on saas.projects
  for insert
  with check (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin', 'developer']));

drop policy if exists saas_projects_update on saas.projects;
create policy saas_projects_update on saas.projects
  for update
  using (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']))
  with check (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']));

drop policy if exists saas_projects_delete on saas.projects;
create policy saas_projects_delete on saas.projects
  for delete
  using (saas.has_org_role(organization_id, saas.current_user_id(), array['owner', 'admin']));

-- Feature tables (team / project membership)
drop policy if exists audit_logs_member_select on saas.audit_logs;
create policy audit_logs_member_select on saas.audit_logs
  for select
  using (
    (organization_id is not null and saas.is_member_of_org(organization_id, saas.current_user_id()))
    or (project_ref is not null and saas.is_member_of_project(project_ref, saas.current_user_id()))
  );

drop policy if exists custom_domains_member_all on saas.custom_domains;
create policy custom_domains_member_all on saas.custom_domains
  for all
  using (saas.is_member_of_project(project_ref, saas.current_user_id()))
  with check (saas.is_member_of_project(project_ref, saas.current_user_id()));

drop policy if exists third_party_auth_member_all on saas.third_party_auth_integrations;
create policy third_party_auth_member_all on saas.third_party_auth_integrations
  for all
  using (saas.is_member_of_project(project_ref, saas.current_user_id()))
  with check (saas.is_member_of_project(project_ref, saas.current_user_id()));

drop policy if exists project_api_keys_member_all on saas.project_api_keys;
create policy project_api_keys_member_all on saas.project_api_keys
  for all
  using (saas.is_member_of_project(project_ref, saas.current_user_id()))
  with check (saas.is_member_of_project(project_ref, saas.current_user_id()));

-- Enforce RLS for non-superuser roles (authenticated API / PostgREST paths).
alter table if exists saas.organizations force row level security;
alter table if exists saas.organization_members force row level security;
alter table if exists saas.organization_invites force row level security;
alter table if exists saas.projects force row level security;
alter table if exists saas.profiles force row level security;

grant usage on schema saas to authenticated, service_role;
grant select, insert, update, delete on saas.organizations to authenticated, service_role;
grant select, insert, update, delete on saas.organization_members to authenticated, service_role;
grant select, insert, update, delete on saas.organization_invites to authenticated, service_role;
grant select, insert, update, delete on saas.projects to authenticated, service_role;
grant select, insert, update, delete on saas.profiles to authenticated, service_role;
