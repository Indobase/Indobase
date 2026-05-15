import { SAAS_CONTROL_PLANE_RLS_SQL } from './controlPlaneRlsBootstrapSql'
import { executeQuery } from './query'
import { repairSaasOrganizationMemberships } from './repairOrganizationMemberships'

/**
 * Applies membership RLS + feature tables (audit_logs, custom_domains, …) on the
 * control-plane DB once per database. Idempotent DDL; skipped if already applied.
 */
export async function ensureSaasControlPlaneRlsApplied(): Promise<void> {
  const probe = await executeQuery<{ n: number }>({
    query: `
      select count(*)::int as n
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'saas'
        and p.proname = 'current_user_id'
    `,
  })
  if (probe.error) throw probe.error
  if ((probe.data?.[0]?.n ?? 0) > 0) return

  await repairSaasOrganizationMemberships()

  const applied = await executeQuery({ query: SAAS_CONTROL_PLANE_RLS_SQL })
  if (applied.error) throw applied.error
}
