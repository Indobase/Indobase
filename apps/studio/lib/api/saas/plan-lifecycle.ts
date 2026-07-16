import { getPlanEntitlements } from './plan-entitlements'
import { executeQuery } from './query'

export { applyIndobaseBadgeToHtml, planHasBackendStudio, planRequiresIndobaseBadge } from './plan-badge'

/**
 * Pause free-tier projects idle for N days (default 7).
 * Basic+ never auto-sleep via this path.
 */
export async function pauseIdleFreeTierProjects({
  dryRun = false,
  limit = 50,
}: {
  dryRun?: boolean
  limit?: number
} = {}): Promise<{
  paused: string[]
  skipped: number
  candidates: number
}> {
  const free = getPlanEntitlements('free')
  const idleDays = free.idleSleepDays ?? 7

  const candidates = await executeQuery<{
    ref: string
    organization_slug: string
    last_activity_at: string | null
  }>({
    query: `
      select
        p.ref,
        p.organization_slug,
        greatest(
          coalesce(p.updated_at, p.inserted_at),
          coalesce(
            (select max(d.updated_at) from saas.project_deployments d where d.project_ref = p.ref),
            p.inserted_at
          )
        ) as last_activity_at
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where lower(o.plan) = 'free'
        and coalesce(p.status, '') not in ('INACTIVE', 'REMOVED', 'DELETED', 'PAUSED', 'GOING_DOWN')
        and coalesce(p.paused_at, 'epoch'::timestamptz) < now() - interval '1 day'
        and greatest(
          coalesce(p.updated_at, p.inserted_at),
          coalesce(
            (select max(d.updated_at) from saas.project_deployments d where d.project_ref = p.ref),
            p.inserted_at
          )
        ) < now() - make_interval(days => $1)
      order by last_activity_at asc
      limit $2
    `,
    parameters: [idleDays, limit],
  })

  if (candidates.error) {
    console.warn('[idle-sleep] candidate query failed:', candidates.error.message)
    return { paused: [], skipped: 0, candidates: 0 }
  }

  const rows = candidates.data ?? []
  if (dryRun || rows.length === 0) {
    return { paused: [], skipped: rows.length, candidates: rows.length }
  }

  const paused: string[] = []
  for (const row of rows) {
    const update = await executeQuery({
      query: `
        update saas.projects
        set
          status = 'INACTIVE',
          paused_at = now(),
          pause_reason = $2,
          updated_at = now()
        where ref = $1
          and coalesce(status, '') not in ('INACTIVE', 'REMOVED', 'DELETED')
      `,
      parameters: [row.ref, `idle_sleep_${idleDays}d_free_tier`],
    })
    if (!update.error) paused.push(row.ref)
  }

  return { paused, skipped: rows.length - paused.length, candidates: rows.length }
}
