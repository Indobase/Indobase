import type { PlanId } from 'data/subscriptions/types'

import { executeQuery } from './query'

export const FREE_BUILDER_PROMPT_LIMIT = 5

const PAID_BUILDER_PLAN_IDS = new Set<PlanId>(['pro', 'team', 'enterprise'])

export function normalizeOrgPlanId(plan: string | null | undefined): PlanId {
  const value = (plan || 'free').trim().toLowerCase()
  if (value === 'tier_free') return 'free'
  if (value === 'tier_pro' || value === 'tier_payg') return 'pro'
  if (value === 'tier_team') return 'team'
  if (value === 'tier_enterprise') return 'enterprise'
  if (value === 'tier_platform') return 'platform'
  return value as PlanId
}

export function isFreeBuilderOrgPlan(plan: string | null | undefined): boolean {
  const planId = normalizeOrgPlanId(plan)
  return !PAID_BUILDER_PLAN_IDS.has(planId) && planId !== 'platform'
}

export type BuilderPromptQuota = {
  plan: PlanId
  used: number
  limit: number | null
  remaining: number | null
  isFree: boolean
}

export async function getBuilderPromptQuota(orgSlug: string): Promise<BuilderPromptQuota | null> {
  const rows = await executeQuery<{ plan: string; builder_prompts_used: number }>({
    query: `
      select plan, coalesce(builder_prompts_used, 0) as builder_prompts_used
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
  const isFree = isFreeBuilderOrgPlan(row.plan)
  const used = Math.max(0, row.builder_prompts_used ?? 0)
  const limit = isFree ? FREE_BUILDER_PROMPT_LIMIT : null
  const remaining = limit == null ? null : Math.max(0, limit - used)

  return { plan, used, limit, remaining, isFree }
}

export async function consumeBuilderPrompt(orgSlug: string): Promise<
  | { ok: true; quota: BuilderPromptQuota }
  | { ok: false; quota: BuilderPromptQuota; upgradeUrl: string }
> {
  const current = await getBuilderPromptQuota(orgSlug)

  if (!current) {
    throw new Error('Organization not found')
  }

  if (!current.isFree) {
    return { ok: true, quota: current }
  }

  if (current.remaining === 0) {
    return {
      ok: false,
      quota: current,
      upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
    }
  }

  const rows = await executeQuery<{ builder_prompts_used: number; plan: string }>({
    query: `
      update saas.organizations
      set
        builder_prompts_used = coalesce(builder_prompts_used, 0) + 1,
        updated_at = now()
      where slug = $1
        and lower(plan) = 'free'
        and coalesce(builder_prompts_used, 0) < $2
      returning builder_prompts_used, plan
    `,
    parameters: [orgSlug, FREE_BUILDER_PROMPT_LIMIT],
  })

  if (rows.error) throw rows.error

  if (!rows.data?.length) {
    const blocked = await getBuilderPromptQuota(orgSlug)
    return {
      ok: false,
      quota: blocked ?? current,
      upgradeUrl: `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`,
    }
  }

  const updated = await getBuilderPromptQuota(orgSlug)
  return { ok: true, quota: updated ?? current }
}
