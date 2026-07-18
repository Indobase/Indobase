/**
 * Repairs the legacy plan constraint installed before Basic and Studio existed.
 * Kept separate from the large bootstrap DDL so already-bootstrapped control
 * planes converge without rerunning all RLS setup.
 */
export const SAAS_CONTROL_PLANE_PLAN_CONSTRAINT_SQL = `
do $saas_plan_constraint$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'organizations_plan_check'
      and n.nspname = 'saas'
      and t.relname = 'organizations'
      and pg_get_constraintdef(c.oid) like '%''basic''%'
      and pg_get_constraintdef(c.oid) like '%''studio''%'
  ) then
    alter table saas.organizations
      drop constraint if exists organizations_plan_check;
    alter table saas.organizations
      add constraint organizations_plan_check
      check (plan in ('free', 'basic', 'pro', 'studio', 'team', 'enterprise', 'platform'));
  end if;
end
$saas_plan_constraint$;
`
