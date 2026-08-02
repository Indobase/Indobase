-- Set project_ref from JWT on insert so clients never pass it (cross-tenant leak surface).

begin;

create or replace function crm.set_row_project_ref()
returns trigger
language plpgsql
security definer
set search_path = crm, pg_catalog
as $$
declare
  v_ref text;
begin
  v_ref := crm.current_project_ref();
  if v_ref is null then
    raise exception 'project_ref claim is required for CRM writes';
  end if;
  new.project_ref := v_ref;
  return new;
end;
$$;

create or replace function crm.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = crm, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists companies_set_project_ref on crm.companies;
create trigger companies_set_project_ref
  before insert on crm.companies
  for each row execute function crm.set_row_project_ref();

drop trigger if exists contacts_set_project_ref on crm.contacts;
create trigger contacts_set_project_ref
  before insert on crm.contacts
  for each row execute function crm.set_row_project_ref();

drop trigger if exists deals_set_project_ref on crm.deals;
create trigger deals_set_project_ref
  before insert on crm.deals
  for each row execute function crm.set_row_project_ref();

drop trigger if exists deals_touch_updated_at on crm.deals;
create trigger deals_touch_updated_at
  before update on crm.deals
  for each row execute function crm.touch_updated_at();

drop trigger if exists companies_touch_updated_at on crm.companies;
create trigger companies_touch_updated_at
  before update on crm.companies
  for each row execute function crm.touch_updated_at();

drop trigger if exists contacts_touch_updated_at on crm.contacts;
create trigger contacts_touch_updated_at
  before update on crm.contacts
  for each row execute function crm.touch_updated_at();

commit;
