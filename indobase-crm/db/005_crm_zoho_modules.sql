-- Indobase CRM — Zoho-oriented modules: leads, activities, notes, richer deal/account/contact fields.

begin;

-- ── Extra fields on existing tables ─────────────────────────────────────────────────────────────
alter table crm.companies
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists description text;

alter table crm.contacts
  add column if not exists title text,
  add column if not exists lead_source text,
  add column if not exists description text;

alter table crm.deals
  add column if not exists probability int check (probability is null or (probability >= 0 and probability <= 100)),
  add column if not exists closing_date date,
  add column if not exists lead_source text,
  add column if not exists description text,
  add column if not exists contact_name text;

-- ── Leads (Zoho-style: unqualified prospects before convert) ────────────────────────────────────
create table if not exists crm.leads (
  id            uuid primary key default gen_random_uuid(),
  project_ref   text not null,
  full_name     text not null,
  email         text,
  phone         text,
  company_name  text,
  title         text,
  lead_source   text,
  status        text not null default 'Open'
                  check (status in ('Open', 'Contacted', 'Qualified', 'Unqualified', 'Converted')),
  description   text,
  converted_contact_id uuid references crm.contacts (id) on delete set null,
  converted_company_id uuid references crm.companies (id) on delete set null,
  converted_deal_id    uuid references crm.deals (id) on delete set null,
  converted_at  timestamptz,
  created_by    uuid references crm.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists crm_leads_project_idx on crm.leads (project_ref);
create index if not exists crm_leads_status_idx on crm.leads (project_ref, status);

-- ── Activities (tasks / calls / meetings) ───────────────────────────────────────────────────────
create table if not exists crm.activities (
  id             uuid primary key default gen_random_uuid(),
  project_ref    text not null,
  kind           text not null check (kind in ('task', 'call', 'meeting')),
  subject        text not null,
  status         text not null default 'Not Started'
                   check (status in ('Not Started', 'In Progress', 'Completed', 'Cancelled')),
  due_at         timestamptz,
  description    text,
  related_module text check (related_module is null or related_module in ('lead', 'contact', 'company', 'deal')),
  related_id     uuid,
  created_by     uuid references crm.members (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists crm_activities_project_idx on crm.activities (project_ref);
create index if not exists crm_activities_related_idx on crm.activities (related_module, related_id);
create index if not exists crm_activities_due_idx on crm.activities (project_ref, due_at);

-- ── Notes (timeline on any record) ──────────────────────────────────────────────────────────────
create table if not exists crm.notes (
  id             uuid primary key default gen_random_uuid(),
  project_ref    text not null,
  body           text not null,
  related_module text not null check (related_module in ('lead', 'contact', 'company', 'deal')),
  related_id     uuid not null,
  created_by     uuid references crm.members (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists crm_notes_related_idx on crm.notes (related_module, related_id, created_at desc);

alter table crm.leads      enable row level security;
alter table crm.activities enable row level security;
alter table crm.notes      enable row level security;
alter table crm.leads      force row level security;
alter table crm.activities force row level security;
alter table crm.notes      force row level security;

drop policy if exists crm_leads_all on crm.leads;
create policy crm_leads_all on crm.leads
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_activities_all on crm.activities;
create policy crm_activities_all on crm.activities
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

drop policy if exists crm_notes_all on crm.notes;
create policy crm_notes_all on crm.notes
  for all using (
    project_ref in (select m.project_ref from crm.members m where m.id in (select crm.current_member_ids()))
  )
  with check (
    project_ref in (
      select m.project_ref from crm.members m
      where m.id in (select crm.current_member_ids()) and m.role <> 'viewer'
    )
  );

-- project_ref from JWT on insert
drop trigger if exists leads_set_project_ref on crm.leads;
create trigger leads_set_project_ref
  before insert on crm.leads
  for each row execute function crm.set_row_project_ref();

drop trigger if exists activities_set_project_ref on crm.activities;
create trigger activities_set_project_ref
  before insert on crm.activities
  for each row execute function crm.set_row_project_ref();

drop trigger if exists notes_set_project_ref on crm.notes;
create trigger notes_set_project_ref
  before insert on crm.notes
  for each row execute function crm.set_row_project_ref();

drop trigger if exists leads_touch_updated_at on crm.leads;
create trigger leads_touch_updated_at
  before update on crm.leads
  for each row execute function crm.touch_updated_at();

drop trigger if exists activities_touch_updated_at on crm.activities;
create trigger activities_touch_updated_at
  before update on crm.activities
  for each row execute function crm.touch_updated_at();

grant select, insert, update, delete on crm.leads to authenticated, service_role;
grant select, insert, update, delete on crm.activities to authenticated, service_role;
grant select, insert, update, delete on crm.notes to authenticated, service_role;

-- ── Convert lead → account + contact + optional deal (Zoho Convert Lead) ────────────────────────
create or replace function crm.convert_lead(
  p_lead_id     uuid,
  p_deal_title  text default null,
  p_stage_id    uuid default null,
  p_amount      numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = crm, pg_catalog
as $$
declare
  v_me uuid;
  v_role text;
  v_lead crm.leads%rowtype;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_stage uuid;
begin
  select m.id, m.role into v_me, v_role
  from crm.members m
  where m.gotrue_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    and m.project_ref = crm.current_project_ref()
  limit 1;

  if v_me is null then raise exception 'not a CRM member of this project'; end if;
  if v_role = 'viewer' then raise exception 'viewers cannot convert leads'; end if;

  select * into v_lead from crm.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'lead not found'; end if;
  if v_lead.project_ref is distinct from crm.current_project_ref() then
    raise exception 'lead not in this project';
  end if;
  if v_lead.status = 'Converted' then
    raise exception 'lead already converted';
  end if;

  if nullif(trim(coalesce(v_lead.company_name, '')), '') is not null then
    insert into crm.companies (project_ref, name, created_by)
    values (v_lead.project_ref, left(trim(v_lead.company_name), 120), v_me)
    returning id into v_company_id;
  end if;

  insert into crm.contacts (
    project_ref, company_id, full_name, email, phone, title, lead_source, description, created_by
  )
  values (
    v_lead.project_ref,
    v_company_id,
    v_lead.full_name,
    v_lead.email,
    v_lead.phone,
    v_lead.title,
    v_lead.lead_source,
    v_lead.description,
    v_me
  )
  returning id into v_contact_id;

  if nullif(trim(coalesce(p_deal_title, '')), '') is not null then
    v_stage := p_stage_id;
    if v_stage is null then
      select s.id into v_stage
      from crm.stages s
      where s.project_ref = v_lead.project_ref
        and not s.is_won and not s.is_lost
      order by s.position
      limit 1;
    end if;
    if v_stage is null then raise exception 'no pipeline stage available for deal'; end if;

    insert into crm.deals (
      project_ref, stage_id, company_id, contact_id, title, amount, currency, lead_source, created_by
    )
    values (
      v_lead.project_ref,
      v_stage,
      v_company_id,
      v_contact_id,
      left(trim(p_deal_title), 160),
      p_amount,
      'INR',
      v_lead.lead_source,
      v_me
    )
    returning id into v_deal_id;
  end if;

  update crm.leads
  set status = 'Converted',
      converted_contact_id = v_contact_id,
      converted_company_id = v_company_id,
      converted_deal_id = v_deal_id,
      converted_at = now(),
      updated_at = now()
  where id = v_lead.id;

  return jsonb_build_object(
    'contact_id', v_contact_id,
    'company_id', v_company_id,
    'deal_id', v_deal_id
  );
end;
$$;

revoke all on function crm.convert_lead(uuid, text, uuid, numeric) from public;
grant execute on function crm.convert_lead(uuid, text, uuid, numeric) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table crm.leads;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then null;
end $$;

commit;
