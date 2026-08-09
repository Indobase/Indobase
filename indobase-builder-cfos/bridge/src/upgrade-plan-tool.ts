/**
 * Agent-facing upgradePlan — Razorpay checkout for Indobase plan ladder.
 * Never invent “you’re on Pro”; never invent checkout URLs.
 */

import type { BillingUpgradePlanResponse } from '@indobase/platform-api'

import { platformBillingUpgradePlan } from './platform-api-client.js'

export const UPGRADE_PLAN_TOOL = {
  name: 'upgradePlan',
  aliases: ['changePlan', 'startPlanUpgrade', 'upgrade_plan'] as const,
  description:
    'Start an Indobase plan upgrade (basic | pro | studio) via real Razorpay checkout. ' +
    'Returns checkout_url when payment is required — quote that URL; never invent it. ' +
    'Do not claim upgraded until API confirms (paid plans stay pending until payment). ' +
    'On Free prompt-quota 402, ask CHOICES then call this. Aliases: changePlan, startPlanUpgrade.',
  method: 'POST' as const,
  path: '/api/os/tools/upgradePlan',
  aliasPath: '/api/os/tools/changePlan',
  wraps: '/api/os/v1/billing/upgrade-plan',
  parameters: {
    type: 'object',
    required: ['plan'],
    properties: {
      plan: {
        type: 'string',
        description: 'Target plan: basic | pro | studio (free only for explicit downgrade)',
      },
      tier: { type: 'string', description: 'Alias for plan (tier_pro etc. also accepted)' },
    },
  },
} as const

export const UPGRADE_PLAN_AGENT_HARD_RULES = `
## upgradePlan (HARD PATH — real billing checkout)

When Free limits block work (402 / prompt_quota_exceeded) or the operator asks to upgrade:

1. Offer CHOICES for the Indobase ladder (Basic / Pro / Studio) — Free is the default, not an “upgrade”.
2. Call **upgradePlan** (aliases **changePlan**, **startPlanUpgrade**) —
   POST /api/os/tools/upgradePlan with { "plan": "pro" } (or basic | studio).
3. If the tool returns checkout_url / pending_checkout_url: quote that EXACT URL. Never invent URLs.
4. NEVER claim they are on Pro/Studio until payment confirms (upgraded:true only for Free downgrade).
5. NEVER raw-UPDATE plan without this tool / Studio billing. Do NOT invent “you’re on Pro”.
`.trim()

export type UpgradePlanToolInput = {
  plan?: string | null
  tier?: string | null
  target_plan?: string | null
  targetPlan?: string | null
}

export type UpgradePlanToolResult = BillingUpgradePlanResponse & {
  tool: 'upgradePlan'
  status?: number
}

const ALLOWED = new Set(['basic', 'pro', 'studio', 'free', 'tier_basic', 'tier_pro', 'tier_studio', 'tier_free', 'team', 'tier_team'])

export function assertUpgradePlanHasTarget(input: UpgradePlanToolInput): {
  ok: boolean
  message?: string
  plan?: string
} {
  const plan = (
    input.plan ||
    input.tier ||
    input.target_plan ||
    input.targetPlan ||
    ''
  )
    .trim()
    .toLowerCase()
  if (!plan) {
    return { ok: false, message: 'plan required (basic | pro | studio)' }
  }
  if (!ALLOWED.has(plan)) {
    return {
      ok: false,
      message: 'plan must be basic, pro, or studio (or free to downgrade)',
    }
  }
  return { ok: true, plan }
}

export async function executeUpgradePlanTool(
  session: { gotrueId: string; email: string; projectRef: string },
  input: UpgradePlanToolInput,
): Promise<UpgradePlanToolResult> {
  const check = assertUpgradePlanHasTarget(input)
  if (!check.ok || !check.plan) {
    return {
      ok: false,
      message: check.message || 'Invalid upgradePlan input',
      tool: 'upgradePlan',
      status: 400,
    }
  }

  const result = await platformBillingUpgradePlan({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    plan: check.plan,
  })

  return {
    ...result,
    tool: 'upgradePlan',
  }
}

export function upgradePlanToolCatalog() {
  return {
    name: UPGRADE_PLAN_TOOL.name,
    aliases: [...UPGRADE_PLAN_TOOL.aliases],
    description: UPGRADE_PLAN_TOOL.description,
    method: UPGRADE_PLAN_TOOL.method,
    path: UPGRADE_PLAN_TOOL.path,
    alias_path: UPGRADE_PLAN_TOOL.aliasPath,
    wraps: UPGRADE_PLAN_TOOL.wraps,
    parameters: UPGRADE_PLAN_TOOL.parameters,
    rules: UPGRADE_PLAN_AGENT_HARD_RULES,
  }
}
