import type { PlanId } from 'data/subscriptions/types'

import { getPlanEntitlements, canonicalizePlanId } from './plan-entitlements'
import { executeQuery } from './query'

export const FREE_VIDEO_AI_LIMIT = 5

export function isVideoAiQuotaDisabled(): boolean {
  const flag = process.env.INDOBASE_VIDEO_AI_QUOTA_DISABLED?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

export function normalizeOrgPlanId(plan: string | null | undefined): PlanId {
  return canonicalizePlanId(plan) as PlanId
}

export type VideoAiQuota = {
  plan: PlanId
  used: number
  limit: number | null
  remaining: number | null
}

export async function getVideoAiQuota(orgSlug: string): Promise<VideoAiQuota | null> {
  const rows = await executeQuery<{ plan: string; video_ai_used: number }>({
    query: `
      select plan, coalesce(video_ai_used, 0) as video_ai_used
      from saas.organizations
      where slug = $1
      limit 1
    `,
    parameters: [orgSlug],
  })

  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null

  const plan = normalizeOrgPlanId(row.plan)
  const entitlements = getPlanEntitlements(row.plan)
  const used = Math.max(0, row.video_ai_used ?? 0)

  if (isVideoAiQuotaDisabled()) {
    return { plan, used, limit: null, remaining: null }
  }

  const limit = entitlements.videoAiLimit
  const remaining = limit == null ? null : Math.max(0, limit - used)
  return { plan, used, limit, remaining }
}

export async function consumeVideoAiCredit(
  orgSlug: string,
  amount = 1
): Promise<
  | { ok: true; quota: VideoAiQuota }
  | { ok: false; quota: VideoAiQuota; upgradeUrl: string; message: string }
> {
  const current = await getVideoAiQuota(orgSlug)
  if (!current) {
    throw new Error('Organization not found')
  }

  if (isVideoAiQuotaDisabled()) {
    return { ok: true, quota: current }
  }

  if (current.limit == null) {
    return { ok: true, quota: current }
  }

  if ((current.remaining ?? 0) < amount) {
    return {
      ok: false,
      quota: current,
      upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
      message: `Video AI quota exhausted (${current.used}/${current.limit}). Upgrade your plan for more credits.`,
    }
  }

  const rows = await executeQuery<{ video_ai_used: number; plan: string }>({
    query: `
      update saas.organizations
      set
        video_ai_used = coalesce(video_ai_used, 0) + $2,
        updated_at = now()
      where slug = $1
        and coalesce(video_ai_used, 0) + $2 <= $3
      returning video_ai_used, plan
    `,
    parameters: [orgSlug, amount, current.limit],
  })

  if (rows.error) throw rows.error

  if (!rows.data?.length) {
    const blocked = await getVideoAiQuota(orgSlug)
    return {
      ok: false,
      quota: blocked ?? current,
      upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
      message: `Video AI quota exhausted. Upgrade your plan for more credits.`,
    }
  }

  const updated = await getVideoAiQuota(orgSlug)
  return { ok: true, quota: updated ?? current }
}
