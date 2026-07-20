import { getPlanEntitlements } from './plan-entitlements'
import { executeQuery } from './query'

export { applyIndobaseBadgeToHtml, planHasBackendStudio, planRequiresIndobaseBadge } from './plan-badge'

/** Plans the idle sweep considers, in ladder order. */
const SLEEPABLE_PLAN_IDS = ['free', 'basic', 'pro', 'studio', 'enterprise', 'platform'] as const

/**
 * Pause projects that have been idle past their plan's `idleSleepDays`.
 *
 * Every plan carries its own threshold (Free 7 days, Basic/Pro 30, Studio+ never), so this sweeps
 * per plan rather than only the free tier. Plans with `canPinProject` honour `saas.projects.keep_warm`,
 * letting an owner keep one low-traffic production app always-warm.
 *
 * This is the GRACEFUL path. The hard host-capacity valve is
 * docker/scripts/cap-idle-tenant-stacks.sh, which may stop stacks before they reach these
 * thresholds when the box is over-subscribed.
 */
export async function pauseIdleProjects({
  dryRun = false,
  limit = 50,
}: {
  dryRun?: boolean
  limit?: number
} = {}): Promise<{
  paused: string[]
  skipped: number
  candidates: number
  byPlan: Record<string, number>
}> {
  const paused: string[] = []
  const byPlan: Record<string, number> = {}
  let totalCandidates = 0
  let totalSkipped = 0

  for (const planId of SLEEPABLE_PLAN_IDS) {
    const entitlements = getPlanEntitlements(planId)

    // null = never auto-sleep (Studio and above).
    if (entitlements.idleSleepDays === null) continue

    const result = await pauseIdlePlanProjects({
      planId,
      idleDays: entitlements.idleSleepDays,
      honourKeepWarm: entitlements.canPinProject,
      dryRun,
      limit,
    })

    totalCandidates += result.candidates
    totalSkipped += result.skipped
    paused.push(...result.paused)
    if (result.paused.length > 0) byPlan[planId] = result.paused.length
  }

  return { paused, skipped: totalSkipped, candidates: totalCandidates, byPlan }
}

/**
 * Back-compat alias. Retained so the existing cron route keeps working; prefer `pauseIdleProjects`,
 * which sweeps every plan rather than only Free.
 */
export const pauseIdleFreeTierProjects = pauseIdleProjects

async function pauseIdlePlanProjects({
  planId,
  idleDays,
  honourKeepWarm,
  dryRun,
  limit,
}: {
  planId: string
  idleDays: number
  honourKeepWarm: boolean
  dryRun: boolean
  limit: number
}): Promise<{
  paused: string[]
  skipped: number
  candidates: number
}> {
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
      where lower(coalesce(o.plan, 'free')) = $3
        and coalesce(p.status, '') not in ('INACTIVE', 'REMOVED', 'DELETED', 'PAUSED', 'GOING_DOWN')
        and coalesce(p.paused_at, 'epoch'::timestamptz) < now() - interval '1 day'
        -- Owner-pinned projects skip the sweep, but only on plans that grant pinning.
        and not ($4 and coalesce(p.keep_warm, false))
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
    parameters: [idleDays, limit, planId, honourKeepWarm],
  })

  if (candidates.error) {
    console.warn(`[idle-sleep] candidate query failed for plan ${planId}:`, candidates.error.message)
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
      parameters: [row.ref, `idle_sleep_${idleDays}d_${planId}`],
    })
    if (!update.error) paused.push(row.ref)
  }

  return { paused, skipped: rows.length - paused.length, candidates: rows.length }
}
