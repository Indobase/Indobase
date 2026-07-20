import { getPlanEntitlements } from './plan-entitlements'
import { pauseProjectForSystem, restoreProjectForSystem } from './project-lifecycle'
import { executeQuery } from './query'
import { collectProjectKongUsage, hasKongUsageMetering } from './usage-collectors/kong-usage'
import { collectProjectDatabaseBytes } from './usage-collectors/postgres-usage'

export type QuotaMetric = 'egress_bytes' | 'database_size'

export type QuotaViolation = {
  metric: QuotaMetric
  used: number
  limit: number
  hard: boolean
}

/**
 * Quota ceilings come from plan-entitlements — the same object the rest of the runtime gates on.
 *
 * This previously used a local EGRESS_LIMITS map that had no `basic` or `studio` key, so both fell
 * through to the free-tier 5 GB ceiling: Basic was throttled at 1/5 of its 25 GB allowance and
 * Studio (₹6,999) at 1/100 of its 500 GB. The database ceiling also fell back to an *egress*
 * constant. Deriving from entitlements is what stops that class of bug.
 */
function quotaCeilings(planId: string | null | undefined): {
  egressLimit: number
  dbLimit: number
} {
  const e = getPlanEntitlements(planId)

  return {
    // null = negotiated / unbounded (enterprise, platform).
    egressLimit: e.egressBytes ?? Number.MAX_SAFE_INTEGER,
    dbLimit: e.databaseBytes ?? Number.MAX_SAFE_INTEGER,
  }
}

function periodStart(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export async function checkProjectQuotas(projectRef: string): Promise<{
  planId: string
  violations: QuotaViolation[]
  usage: { egressBytes: number; databaseBytes: number | null }
}> {
  const row = await executeQuery<{
    plan: string
    status: string
    pause_reason: string | null
  }>({
    query: `
      select o.plan, p.status, p.pause_reason
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1
      limit 1
    `,
    parameters: [projectRef],
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) throw new Error('Project not found')

  const { egressLimit, dbLimit } = quotaCeilings(p.plan)

  let egressBytes = 0
  if (await hasKongUsageMetering()) {
    const kong = await collectProjectKongUsage({ projectRef, periodStart: periodStart() })
    egressBytes = kong.egressBytes
  }

  const databaseBytes = await collectProjectDatabaseBytes(projectRef)

  const violations: QuotaViolation[] = []

  if (egressBytes > egressLimit) {
    violations.push({
      metric: 'egress_bytes',
      used: egressBytes,
      limit: egressLimit,
      hard: p.plan === 'free',
    })
  }

  if (databaseBytes != null && databaseBytes > dbLimit) {
    violations.push({
      metric: 'database_size',
      used: databaseBytes,
      limit: dbLimit,
      hard: p.plan === 'free',
    })
  }

  return {
    planId: p.plan,
    violations,
    usage: { egressBytes, databaseBytes },
  }
}

export async function enforceProjectQuotas(projectRef: string): Promise<{
  action: 'none' | 'paused' | 'restored'
  violations: QuotaViolation[]
}> {
  const check = await checkProjectQuotas(projectRef)
  const hardViolations = check.violations.filter((v) => v.hard)

  const statusRow = await executeQuery<{ status: string; pause_reason: string | null }>({
    query: `select status, pause_reason from saas.projects where ref = $1 limit 1`,
    parameters: [projectRef],
  })
  const status = statusRow.data?.[0]?.status ?? 'ACTIVE_HEALTHY'
  const quotaPaused = statusRow.data?.[0]?.pause_reason === 'quota_exceeded'

  if (hardViolations.length > 0 && status !== 'INACTIVE' && status !== 'PAUSING') {
    await pauseProjectForSystem({
      ref: projectRef,
      reason: 'quota_exceeded',
      metric: hardViolations[0]!.metric,
    })
    return { action: 'paused', violations: hardViolations }
  }

  if (hardViolations.length === 0 && quotaPaused && status === 'INACTIVE') {
    await restoreProjectForSystem({ ref: projectRef, reason: 'quota_recovered' })
    return { action: 'restored', violations: [] }
  }

  return { action: 'none', violations: check.violations }
}

export async function enforceAllProjectQuotas(): Promise<{
  checked: number
  paused: number
  restored: number
  results: Array<{ ref: string; action: string }>
}> {
  const rows = await executeQuery<{ ref: string }>({
    query: `
      select ref from saas.projects
      where is_branch = false
        and coalesce(trim(connection_string_enc), '') <> ''
      order by ref
    `,
    parameters: [],
  })
  if (rows.error) throw rows.error

  const results: Array<{ ref: string; action: string }> = []
  let paused = 0
  let restored = 0

  for (const { ref } of rows.data ?? []) {
    try {
      const r = await enforceProjectQuotas(ref)
      results.push({ ref, action: r.action })
      if (r.action === 'paused') paused++
      if (r.action === 'restored') restored++
    } catch (e) {
      results.push({
        ref,
        action: `error:${e instanceof Error ? e.message : 'unknown'}`,
      })
    }
  }

  return { checked: results.length, paused, restored, results }
}
