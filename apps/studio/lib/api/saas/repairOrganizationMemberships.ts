import { executeQuery } from './query'

/**
 * Removes orphan membership rows and backfills owner rows before FK / RLS bootstrap.
 * Prevents `organization_members_org_fk` failures when legacy data references deleted orgs.
 */
export async function repairSaasOrganizationMemberships(): Promise<void> {
  const repaired = await executeQuery({
    query: `
      delete from saas.organization_members m
      where not exists (
        select 1 from saas.organizations o where o.id = m.organization_id
      );

      insert into saas.organization_members (organization_id, gotrue_id, role)
      select o.id, o.owner_gotrue_id, 'owner'
      from saas.organizations o
      left join saas.organization_members m
        on m.organization_id = o.id and m.gotrue_id = o.owner_gotrue_id
      where m.organization_id is null;

      -- Keep one PERSONAL org per owner (most projects, then lowest id) so RLS bootstrap can add the unique index.
      with ranked_personal as (
        select o.id,
          row_number() over (
            partition by o.owner_gotrue_id
            order by
              (select count(*) from saas.projects p where p.organization_id = o.id) desc,
              o.id asc
          ) as rn
        from saas.organizations o
        where o.kind = 'PERSONAL'
      )
      update saas.organizations o
      set kind = 'TEAM', updated_at = now()
      from ranked_personal r
      where o.id = r.id and r.rn > 1;
    `,
  })
  if (repaired.error) throw repaired.error
}
