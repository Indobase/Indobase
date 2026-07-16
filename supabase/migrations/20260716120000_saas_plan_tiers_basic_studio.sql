-- Extend organizations.plan to Free / Basic / Pro / Studio / Enterprise ladder.
-- Legacy `team` remains valid (treated as Studio in application code).

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organizations_plan_check'
      and conrelid = 'saas.organizations'::regclass
  ) then
    alter table saas.organizations drop constraint organizations_plan_check;
  end if;
exception
  when undefined_table then
    null;
  when undefined_object then
    null;
end $$;

do $$
begin
  alter table saas.organizations
    add constraint organizations_plan_check
    check (plan in ('free', 'basic', 'pro', 'studio', 'team', 'enterprise', 'platform'));
exception
  when undefined_table then
    null;
  when duplicate_object then
    null;
end $$;
