-- Indobase CRM — tags + simple automation (Zoho Blueprint-lite / workflow-lite).

begin;

create table if not exists crm.tags (
  id           uuid primary key default gen_random_uuid(),
  project_ref  text not null,
  name         text not null,
  color        text not null default '#3B8FD6',
  created_at   timestamptz not null default now(),
  unique (project_ref, name)
);

create table if not exists crm.record_tags (
  tag_id         uuid not null references crm.tags (id) on delete cascade,
  related_module text not null check (related_module in ('lead', 'contact', 'company', 'deal')),
  related_id     uuid not null,
  created_at     timestamptz not null default now(),
  primary key (tag_id, related_module, related_id)
);

create index if not exists crm_record_tags_related_idx
  on crm.record_tags (related_module, related_id);

-- When lead hits a status (or deal hits a stage name), create a task.
create table if not exists crm.automation_rules (
  id              uuid primary key default gen_random_uuid(),
  project_ref     text not null,
  name            text not null,
  enabled         boolean not null default true,
  trigger_module  text not null check (trigger_module in ('lead', 'deal')),
  -- lead: status name; deal: stage name
  trigger_value   text not null,
  action_subject  text not null,
  action_kind     text not null default 'task'
                    check (action_kind in ('task', 'call', 'meeting')),
  created_by      uuid references crm.members (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists crm_automation_rules_project_idx
  on crm.automation_rules (project_ref) where enabled;

alter table crm.tags enable row level security;
alter table crm.record_tags enable row level security;
alter table crm.automation_rules enable row level security;
alter table crm.tags force row level security;
alter table crm.record_tags force row level security;
alter table crm.automation_rules force row level security;

drop policy if exists crm_tags_all on crm.tags;
create policy crm_tags_all on crm.tags
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_record_tags_all on crm.record_tags;
create policy crm_record_tags_all on crm.record_tags
  for all using (
    tag_id in (select t.id from crm.tags t)
  )
  with check (
    tag_id in (
      select t.id from crm.tags t
      where t.project_ref in (
        select m.project_ref from crm.members m
        where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
      )
    )
  );

drop policy if exists crm_automation_rules_all on crm.automation_rules;
create policy crm_automation_rules_all on crm.automation_rules
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids())
        and m.role in ('owner', 'admin', 'developer')
    )
  );

drop trigger if exists tags_set_project_ref on crm.tags;
create trigger tags_set_project_ref
  before insert on crm.tags
  for each row execute function crm.set_row_project_ref();

drop trigger if exists automation_rules_set_project_ref on crm.automation_rules;
create trigger automation_rules_set_project_ref
  before insert on crm.automation_rules
  for each row execute function crm.set_row_project_ref();

grant select, insert, update, delete on crm.tags to authenticated, service_role;
grant select, insert, delete on crm.record_tags to authenticated, service_role;
grant select, insert, update, delete on crm.automation_rules to authenticated, service_role;

-- Fire automation when a lead status changes.
create or replace function crm.run_lead_automations()
returns trigger
language plpgsql
security definer
set search_path = crm, pg_catalog
as $$
declare
  v_rule record;
  v_me uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select m.id into v_me
  from crm.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = new.project_ref
  limit 1;

  for v_rule in
    select *
    from crm.automation_rules r
    where r.project_ref = new.project_ref
      and r.enabled
      and r.trigger_module = 'lead'
      and r.trigger_value = new.status
  loop
    insert into crm.activities (
      project_ref, kind, subject, status, related_module, related_id, created_by
    )
    values (
      new.project_ref,
      v_rule.action_kind,
      v_rule.action_subject || ' — ' || new.full_name,
      'Not Started',
      'lead',
      new.id,
      v_me
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists leads_run_automations on crm.leads;
create trigger leads_run_automations
  after insert or update of status on crm.leads
  for each row execute function crm.run_lead_automations();

-- Fire automation when a deal moves to a named stage.
create or replace function crm.run_deal_automations()
returns trigger
language plpgsql
security definer
set search_path = crm, pg_catalog
as $$
declare
  v_rule record;
  v_stage_name text;
  v_me uuid;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select s.name into v_stage_name from crm.stages s where s.id = new.stage_id;
  if v_stage_name is null then return new; end if;

  select m.id into v_me
  from crm.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = new.project_ref
  limit 1;

  for v_rule in
    select *
    from crm.automation_rules r
    where r.project_ref = new.project_ref
      and r.enabled
      and r.trigger_module = 'deal'
      and r.trigger_value = v_stage_name
  loop
    insert into crm.activities (
      project_ref, kind, subject, status, related_module, related_id, created_by
    )
    values (
      new.project_ref,
      v_rule.action_kind,
      v_rule.action_subject || ' — ' || new.title,
      'Not Started',
      'deal',
      new.id,
      v_me
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists deals_run_automations on crm.deals;
create trigger deals_run_automations
  after insert or update of stage_id on crm.deals
  for each row execute function crm.run_deal_automations();

-- Pipeline report helper (one round-trip for Reports).
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
  where s.project_ref in (
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
