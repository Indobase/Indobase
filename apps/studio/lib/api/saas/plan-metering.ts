import { getPlanEntitlements, canonicalizePlanId } from './plan-entitlements'
import { arePlanGatesBypassed } from './plan-gates'
import { executeQuery } from './query'

export type AppLimitResult =
  | { ok: true; plan: string; used: number; limit: number | null }
  | {
      ok: false
      plan: string
      used: number
      limit: number
      message: string
      upgradeUrl: string
    }

export async function checkOrganizationAppLimit(orgSlug: string): Promise<AppLimitResult> {
  const rows = await executeQuery<{ plan: string; project_count: number }>({
    query: `
      select
        o.plan,
        (
          select count(*)::int
          from saas.projects p
          where p.organization_id = o.id
            and coalesce(p.status, '') not in ('REMOVED', 'DELETED')
        ) as project_count
      from saas.organizations o
      where o.slug = $1
      limit 1
    `,
    parameters: [orgSlug],
  })

  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) throw new Error('Organization not found')

  const entitlements = getPlanEntitlements(row.plan)
  const used = row.project_count ?? 0
  const limit = entitlements.maxApps

  if (arePlanGatesBypassed() || limit == null || used < limit) {
    return { ok: true, plan: canonicalizePlanId(row.plan), used, limit: arePlanGatesBypassed() ? null : limit }
  }

  const upgradeHint =
    entitlements.planId === 'free'
      ? 'Upgrade to Basic (₹499/mo) for 3 apps, or Pro for backend Studio.'
      : entitlements.planId === 'basic'
        ? 'Upgrade to Pro (₹1,999/mo) for 5 apps and backend Studio.'
        : entitlements.planId === 'pro'
          ? 'Upgrade to Studio (₹6,999/mo) for 15 apps and team seats.'
          : 'Contact sales for a higher app limit.'

  return {
    ok: false,
    plan: canonicalizePlanId(row.plan),
    used,
    limit,
    message: `Your ${entitlements.displayName} plan allows ${limit} app${limit === 1 ? '' : 's'}. You have ${used}. ${upgradeHint}`,
    upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
  }
}

export type SeatLimitResult =
  | { ok: true; used: number; limit: number | null }
  | { ok: false; used: number; limit: number; message: string }

export async function checkOrganizationSeatLimit(orgSlug: string): Promise<SeatLimitResult> {
  const rows = await executeQuery<{ plan: string; member_count: number }>({
    query: `
      select
        o.plan,
        (select count(*)::int from saas.organization_members m where m.organization_id = o.id) as member_count
      from saas.organizations o
      where o.slug = $1
      limit 1
    `,
    parameters: [orgSlug],
  })

  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) throw new Error('Organization not found')

  const entitlements = getPlanEntitlements(row.plan)
  const used = row.member_count ?? 0
  const limit = entitlements.maxSeats

  if (arePlanGatesBypassed() || limit == null || used < limit) {
    return { ok: true, used, limit: arePlanGatesBypassed() ? null : limit }
  }

  return {
    ok: false,
    used,
    limit,
    message: `Your ${entitlements.displayName} plan allows ${limit} seat${limit === 1 ? '' : 's'}. Upgrade to Studio (₹6,999/mo) for 3 seats.`,
  }
}

export type BuildQuotaResult =
  | { ok: true; used: number; limit: number | null; plan: string }
  | {
      ok: false
      used: number
      limit: number
      plan: string
      message: string
      upgradeUrl: string
    }

/**
 * Counts successful/queued deployments for the org today (UTC).
 * Requires `saas.deployments` with project → org join.
 */
export async function checkOrganizationBuildQuota(orgSlug: string): Promise<BuildQuotaResult> {
  const planRows = await executeQuery<{ plan: string; organization_id: number }>({
    query: `select plan, id as organization_id from saas.organizations where slug = $1 limit 1`,
    parameters: [orgSlug],
  })
  if (planRows.error) throw planRows.error
  const org = planRows.data?.[0]
  if (!org) throw new Error('Organization not found')

  const entitlements = getPlanEntitlements(org.plan)
  const limit = entitlements.buildsPerDay

  if (arePlanGatesBypassed() || limit == null) {
    return { ok: true, used: 0, limit: null, plan: canonicalizePlanId(org.plan) }
  }

  const countRows = await executeQuery<{ used: number }>({
    query: `
      select count(*)::int as used
      from saas.project_deployments d
      join saas.projects p on p.ref = d.project_ref
      where p.organization_id = $1
        and d.inserted_at >= date_trunc('day', now() at time zone 'utc')
        and coalesce(d.status, '') not in ('failed', 'cancelled', 'error')
    `,
    parameters: [org.organization_id],
  })

  // If deployments table/columns differ, fail open on schema errors for older envs.
  if (countRows.error) {
    console.warn('[plan-metering] build quota count failed; allowing build:', countRows.error.message)
    return { ok: true, used: 0, limit, plan: canonicalizePlanId(org.plan) }
  }

  const used = countRows.data?.[0]?.used ?? 0
  if (used < limit) {
    return { ok: true, used, limit, plan: canonicalizePlanId(org.plan) }
  }

  const upgradeHint =
    entitlements.planId === 'free'
      ? 'Upgrade to Basic (₹499/mo) for ~60 builds/day.'
      : 'Upgrade to Pro (₹1,999/mo) for unlimited fair-use builds.'

  return {
    ok: false,
    used,
    limit,
    plan: canonicalizePlanId(org.plan),
    message: `Daily build limit reached (${used}/${limit}) on ${entitlements.displayName}. ${upgradeHint}`,
    upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
  }
}

export async function getOrganizationPlanByProjectRef(projectRef: string): Promise<string | null> {
  const rows = await executeQuery<{ plan: string }>({
    query: `
      select o.plan
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1
      limit 1
    `,
    parameters: [projectRef],
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.plan ?? null
}
