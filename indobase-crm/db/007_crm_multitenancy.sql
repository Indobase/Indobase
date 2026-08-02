-- Indobase CRM — fail-closed project-scoped multitenancy.
-- Temporary CRM JWTs always include `project_ref` (see createTemporaryProjectApiKey +
-- assertUserScopedToken). Without that claim, reads previously could span every project the
-- caller belonged to on a shared DB. Require the claim so isolation is enforced in Postgres.

begin;

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

revoke all on function crm.current_project_ref() from public;
grant execute on function crm.current_project_ref() to authenticated, service_role, anon;

-- Fail closed: no project_ref claim → no membership rows → RLS returns nothing.
-- row_security=off: FORCE RLS would otherwise re-enter this function via members policies.
create or replace function crm.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = crm, pg_catalog
set row_security = off
as $$
  select m.id
  from crm.members m
  where crm.current_project_ref() is not null
    and m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = crm.current_project_ref();
$$;

revoke all on function crm.current_member_ids() from public;
grant execute on function crm.current_member_ids() to authenticated, service_role;

-- Members: JWT project only (no self-select on members — that recurses under FORCE RLS).
drop policy if exists crm_members_select on crm.members;
create policy crm_members_select on crm.members
  for select using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and exists (select 1 from crm.current_member_ids())
  );

-- Core tables: require row.project_ref to match JWT claim as well as membership.
drop policy if exists crm_companies_all on crm.companies;
create policy crm_companies_all on crm.companies
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_contacts_all on crm.contacts;
create policy crm_contacts_all on crm.contacts
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_stages_select on crm.stages;
create policy crm_stages_select on crm.stages
  for select using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  );

drop policy if exists crm_stages_write on crm.stages;
create policy crm_stages_write on crm.stages
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role in ('owner', 'admin')
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role in ('owner', 'admin')
    )
  );

drop policy if exists crm_deals_all on crm.deals;
create policy crm_deals_all on crm.deals
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_leads_all on crm.leads;
create policy crm_leads_all on crm.leads
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_activities_all on crm.activities;
create policy crm_activities_all on crm.activities
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_notes_all on crm.notes;
create policy crm_notes_all on crm.notes
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_tags_all on crm.tags;
create policy crm_tags_all on crm.tags
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_automation_rules_all on crm.automation_rules;
create policy crm_automation_rules_all on crm.automation_rules
  for all using (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  )
  with check (
    crm.current_project_ref() is not null
    and project_ref = crm.current_project_ref()
    and project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids())
        and m.role in ('owner', 'admin', 'developer')
    )
  );

-- pipeline_report already uses current_member_ids(); reaffirm JWT match.
create or replace function crm.pipeline_report()
returns table (
  stage_id uuid,
  stage_name text,
  deal_count bigint,
  total_amount numeric,
  is_won boolean,
  is_lost boolean
)
language sql
stable
security invoker
as $$
  select
    s.id,
    s.name,
    count(d.id)::bigint,
    coalesce(sum(d.amount), 0)::numeric,
    s.is_won,
    s.is_lost
  from crm.stages s
  left join crm.deals d on d.stage_id = s.id
  where crm.current_project_ref() is not null
    and s.project_ref = crm.current_project_ref()
    and s.project_ref in (
      select m.project_ref from crm.members m where m.id in (select crm.current_member_ids())
    )
  group by s.id, s.name, s.position, s.is_won, s.is_lost
  order by s.position;
$$;

grant execute on function crm.pipeline_report() to authenticated, service_role;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then null;
end $$;

commit;
