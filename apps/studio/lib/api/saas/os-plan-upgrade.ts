/**
 * OS agent: start Indobase plan upgrade via Razorpay checkout (never invent paid plan).
 */
import { updateOrganizationSubscription } from './org-billing'
import { getOsWorkspace } from './os-workspace'
import { tierToPlanId, isRazorpayConfigured } from './razorpay-billing'
import type { Claims } from './platform'
import type { PlanId } from 'data/subscriptions/types'

const UPGRADABLE: PlanId[] = ['basic', 'pro', 'studio']
const DOWNGRADEABLE: PlanId[] = ['free']

export type UpgradeOsPlanInput = {
  claims: Claims
  workspaceRef: string
  /** basic | pro | studio | free (downgrade) — also accepts tier_* forms */
  plan?: string | null
  tier?: string | null
  targetPlan?: string | null
}

export type UpgradeOsPlanResult =
  | {
      ok: true
      plan: PlanId
      organization_slug: string
      checkout_url?: string
      pending_checkout_url?: string
      provider?: 'razorpay'
      payment_required: boolean
      upgraded: boolean
      message: string
    }
  | { ok: false; status: number; message: string; code?: string }

function normalizeTarget(raw: string): PlanId {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === 'team') return 'studio'
  // Accept bare ids (pro) and Studio tier_* forms (tier_pro).
  if (trimmed.startsWith('tier_')) return tierToPlanId(trimmed)
  return tierToPlanId(trimmed)
}

/**
 * Start checkout for a paid plan, or downgrade to Free when requested.
 * Never marks the org as Pro/Studio without Razorpay confirmation (except Free downgrade).
 */
export async function upgradeOsOrganizationPlan(
  input: UpgradeOsPlanInput,
): Promise<UpgradeOsPlanResult> {
  const workspaceRef = input.workspaceRef.trim()
  if (!workspaceRef) {
    return { ok: false, status: 400, message: 'workspace_ref required', code: 'workspace_ref_required' }
  }

  const rawPlan =
    (typeof input.plan === 'string' && input.plan.trim()) ||
    (typeof input.tier === 'string' && input.tier.trim()) ||
    (typeof input.targetPlan === 'string' && input.targetPlan.trim()) ||
    ''

  if (!rawPlan) {
    return {
      ok: false,
      status: 400,
      message: 'plan required (basic | pro | studio)',
      code: 'plan_required',
    }
  }

  let target: PlanId
  try {
    target = normalizeTarget(rawPlan)
  } catch {
    return { ok: false, status: 400, message: 'Invalid plan', code: 'invalid_plan' }
  }

  if (target === 'team') target = 'studio'

  if (![...UPGRADABLE, ...DOWNGRADEABLE].includes(target)) {
    return {
      ok: false,
      status: 400,
      message:
        target === 'enterprise' || target === 'platform'
          ? 'Contact sales for Enterprise'
          : 'plan must be basic, pro, or studio (or free to downgrade)',
      code: 'invalid_plan',
    }
  }

  const workspace = await getOsWorkspace({ claims: input.claims, ref: workspaceRef })
  if (!workspace) {
    return { ok: false, status: 404, message: 'Workspace not found', code: 'workspace_not_found' }
  }

  if (target !== 'free' && !isRazorpayConfigured()) {
    return {
      ok: false,
      status: 503,
      message: 'Billing is not configured. Try again later or open Studio billing.',
      code: 'billing_not_configured',
    }
  }

  try {
    const result = await updateOrganizationSubscription({
      claims: input.claims,
      slug: workspace.organization_slug,
      tier: target,
    })

    const checkoutUrl =
      'pending_checkout_url' in result && typeof result.pending_checkout_url === 'string'
        ? result.pending_checkout_url
        : undefined

    if (target === 'free') {
      return {
        ok: true,
        plan: 'free',
        organization_slug: workspace.organization_slug,
        payment_required: false,
        upgraded: true,
        message: 'Organization plan set to Free',
      }
    }

    if (!checkoutUrl) {
      return {
        ok: false,
        status: 502,
        message: 'Checkout URL missing — plan was not upgraded. Do not claim the plan changed.',
        code: 'checkout_url_missing',
      }
    }

    return {
      ok: true,
      plan: target,
      organization_slug: workspace.organization_slug,
      checkout_url: checkoutUrl,
      pending_checkout_url: checkoutUrl,
      provider: 'razorpay',
      payment_required: true,
      upgraded: false,
      message:
        `Payment required to move to ${target}. Quote this checkout_url to the operator. ` +
        'Do not claim they are upgraded until payment confirms.',
    }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      message: error instanceof Error ? error.message : 'Failed to start plan upgrade',
      code: 'upgrade_failed',
    }
  }
}
