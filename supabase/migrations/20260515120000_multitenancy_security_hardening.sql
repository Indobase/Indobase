create or replace function public.set_owner_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

revoke select on all tables in schema public from anon;
alter default privileges in schema public revoke select on tables from anon;

alter table if exists saas.organizations force row level security;
alter table if exists saas.organization_members force row level security;
alter table if exists saas.organization_invites force row level security;
alter table if exists saas.projects force row level security;
alter table if exists saas.profiles force row level security;
