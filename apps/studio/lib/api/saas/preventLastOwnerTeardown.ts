/**
 * When deleting saas.organizations, FK CASCADE deletes organization_members rows.
 * saas.prevent_last_owner blocks deleting the last owner — which breaks org deletion.
 * The trigger skips that check when app.allow_organization_teardown is true for the transaction.
 */
export const SAAS_PREVENT_LAST_OWNER_SQL = `
create or replace function saas.prevent_last_owner()
returns trigger
language plpgsql
as $$
declare
  owner_count int;
  target_org_id int;
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_organization_teardown', true), '') = 'true' then
    return old;
  end if;
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
    target_org_id := old.organization_id;
    select count(*) into owner_count
    from saas.organization_members
    where organization_id = target_org_id
      and gotrue_id <> old.gotrue_id
      and role = 'owner';
    if owner_count = 0 then
      raise exception 'Cannot remove the last owner from organization %', target_org_id using errcode = 'P0001';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      target_org_id := new.organization_id;
      select count(*) into owner_count
      from saas.organization_members
      where organization_id = target_org_id
        and gotrue_id <> old.gotrue_id
        and role = 'owner';
      if owner_count = 0 then
        raise exception 'Cannot demote the last owner from organization %', target_org_id using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  return new;
end
$$;
`

import { executeQuery } from './query'

/** Idempotent: replaces trigger function on existing databases. */
export async function ensureSaasPreventLastOwnerAllowsOrgCascade(): Promise<void> {
  const applied = await executeQuery({ query: SAAS_PREVENT_LAST_OWNER_SQL })
  if (applied.error) throw applied.error
}
