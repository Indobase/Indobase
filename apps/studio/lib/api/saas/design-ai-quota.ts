import type { PlanId } from 'data/subscriptions/types'

import { getPlanEntitlements, canonicalizePlanId } from './plan-entitlements'
import { arePlanGatesBypassed } from './plan-gates'
import { executeQuery } from './query'

export function isDesignAiQuotaDisabled(): boolean {
  if (arePlanGatesBypassed()) return true
  const flag = process.env.INDOBASE_DESIGN_AI_QUOTA_DISABLED?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

export function normalizeOrgPlanId(plan: string | null | undefined): PlanId {
  return canonicalizePlanId(plan) as PlanId
}

export type DesignAiQuota = {
  plan: PlanId
  used: number
  limit: number | null
  remaining: number | null
}

export async function ensureDesignAiColumn(): Promise<void> {
  await executeQuery({
    query: `
      alter table saas.organizations
        add column if not exists design_ai_used integer not null default 0
    `,
    parameters: [],
  })
}

export async function getDesignAiQuota(orgSlug: string): Promise<DesignAiQuota | null> {
  await ensureDesignAiColumn()
  const rows = await executeQuery<{ plan: string; design_ai_used: number }>({
    query: `
      select plan, coalesce(design_ai_used, 0) as design_ai_used
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
  const used = Math.max(0, row.design_ai_used ?? 0)

  if (isDesignAiQuotaDisabled()) {
    return { plan, used, limit: null, remaining: null }
  }

  const limit = entitlements.designAiLimit
  const remaining = limit == null ? null : Math.max(0, limit - used)
  return { plan, used, limit, remaining }
}

export async function consumeDesignAiCredit(
  orgSlug: string,
  amount = 1
): Promise<
  | { ok: true; quota: DesignAiQuota }
  | { ok: false; quota: DesignAiQuota; upgradeUrl: string; message: string }
> {
  const current = await getDesignAiQuota(orgSlug)
  if (!current) {
    throw new Error('Organization not found')
  }

  if (isDesignAiQuotaDisabled()) {
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
      message: `Design AI quota exhausted (${current.used}/${current.limit}). Upgrade your plan for more drafts.`,
    }
  }

  const rows = await executeQuery<{ design_ai_used: number; plan: string }>({
    query: `
      update saas.organizations
      set
        design_ai_used = coalesce(design_ai_used, 0) + $2,
        updated_at = now()
      where slug = $1
        and coalesce(design_ai_used, 0) + $2 <= $3
      returning design_ai_used, plan
    `,
    parameters: [orgSlug, amount, current.limit],
  })

  if (rows.error) throw rows.error

  if (!rows.data?.length) {
    const blocked = await getDesignAiQuota(orgSlug)
    return {
      ok: false,
      quota: blocked ?? current,
      upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
      message: `Design AI quota exhausted. Upgrade your plan for more drafts.`,
    }
  }

  const updated = await getDesignAiQuota(orgSlug)
  return { ok: true, quota: updated ?? current }
}
