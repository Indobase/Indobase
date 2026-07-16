/**
 * Canonical Indobase plan entitlements & metering.
 *
 * Apps on EVERY tier (Free included) run on a real Indobase backend — the AI manages it via the
 * Builder. What you buy is direct control and headroom.
 *
 * Motives (do not stretch one motive across tiers):
 * - Free → Basic: access (open Studio to see/edit your own data) + custom domain, no badge
 * - Basic → Pro: headroom (bigger DB, more apps, GitHub export, dedicated stack)
 * - Pro → Studio: team (seats, shared billing, priority builds)
 * - Enterprise: compliance / SLA / dedicated
 */

export type IndobasePlanId =
  | 'free'
  | 'basic'
  | 'pro'
  | 'studio'
  | 'team' // legacy alias of studio (existing org rows / Razorpay)
  | 'enterprise'
  | 'platform'

export type PlanEntitlements = {
  planId: IndobasePlanId
  displayName: string
  /** Monthly INR; null = contact sales / internal */
  priceInr: number | null
  /** Max active apps (projects) in the org */
  maxApps: number | null
  /** Max org seats (members); null = unlimited / custom */
  maxSeats: number | null
  /** Soft daily deploy/build allowance; null = fair-use unlimited */
  buildsPerDay: number | null
  /** Database size budget bytes (org aggregate guidance) */
  databaseBytes: number | null
  /** Free-tier idle sleep after N days; null = never auto-sleep */
  idleSleepDays: number | null
  showIndobaseBadge: boolean
  customDomain: boolean
  backendStudio: boolean
  githubExport: boolean
  priorityBuildQueue: boolean
  sharedBilling: boolean
  /** Dedicated tenant stack (vs shared gateway for frontend-only tiers) */
  isolatedStack: boolean
  /** Builder chat prompts; null = unlimited */
  builderPromptLimit: number | null
}

const GB = 1024 ** 3

/** Legacy `team` rows inherit Studio entitlements. */
export function canonicalizePlanId(plan: string | null | undefined): IndobasePlanId {
  const value = (plan || 'free').trim().toLowerCase()
  if (value === 'tier_free' || value === 'free') return 'free'
  if (value === 'tier_basic' || value === 'basic') return 'basic'
  if (value === 'tier_pro' || value === 'tier_payg' || value === 'pro') return 'pro'
  if (value === 'tier_studio' || value === 'studio') return 'studio'
  if (value === 'tier_team' || value === 'team') return 'team'
  if (value === 'tier_enterprise' || value === 'enterprise') return 'enterprise'
  if (value === 'tier_platform' || value === 'platform') return 'platform'
  return 'free'
}

/** Effective entitlements key: team → studio. */
export function entitlementsPlanKey(plan: string | null | undefined): IndobasePlanId {
  const id = canonicalizePlanId(plan)
  return id === 'team' ? 'studio' : id
}

const ENTITLEMENTS: Record<'free' | 'basic' | 'pro' | 'studio' | 'enterprise' | 'platform', PlanEntitlements> =
  {
    free: {
      planId: 'free',
      displayName: 'Free',
      priceInr: 0,
      maxApps: 1,
      maxSeats: 1,
      buildsPerDay: 20,
      /** Free apps still get a real backend, so this must be capped — null would be unbounded. */
      databaseBytes: 512 * 1024 ** 2,
      idleSleepDays: 7,
      showIndobaseBadge: true,
      customDomain: false,
      backendStudio: false,
      githubExport: false,
      priorityBuildQueue: false,
      sharedBilling: false,
      isolatedStack: false,
      builderPromptLimit: 5,
    },
    basic: {
      planId: 'basic',
      displayName: 'Basic',
      priceInr: 499,
      maxApps: 3,
      maxSeats: 1,
      buildsPerDay: 60,
      databaseBytes: 1 * GB,
      idleSleepDays: null,
      showIndobaseBadge: false,
      customDomain: true,
      /** Apps on every tier run on an Indobase backend; Basic is where the owner can open Studio. */
      backendStudio: true,
      githubExport: false,
      priorityBuildQueue: false,
      sharedBilling: false,
      isolatedStack: false,
      builderPromptLimit: null,
    },
    pro: {
      planId: 'pro',
      displayName: 'Pro',
      priceInr: 1999,
      maxApps: 5,
      maxSeats: 1,

      /*
       * Fair-use ceiling, NOT unlimited: AI generation is the dominant variable cost
       * (OpenRouter tokens per build). An uncapped Pro seat can out-spend ₹1,999 many times over.
       */
      buildsPerDay: 150,
      databaseBytes: 8 * GB,
      idleSleepDays: null,
      showIndobaseBadge: false,
      customDomain: true,
      backendStudio: true,
      githubExport: true,
      priorityBuildQueue: false,
      sharedBilling: false,
      isolatedStack: true,
      builderPromptLimit: null,
    },
    studio: {
      planId: 'studio',
      displayName: 'Studio',
      priceInr: 6999,
      maxApps: 15,
      maxSeats: 3,
      /** Pooled across seats; still bounded so a team can't run an open tab on inference. */
      buildsPerDay: 300,
      databaseBytes: 20 * GB,
      idleSleepDays: null,
      showIndobaseBadge: false,
      customDomain: true,
      backendStudio: true,
      githubExport: true,
      priorityBuildQueue: true,
      sharedBilling: true,
      isolatedStack: true,
      builderPromptLimit: null,
    },
    enterprise: {
      planId: 'enterprise',
      displayName: 'Enterprise',
      priceInr: null,
      maxApps: null,
      maxSeats: null,
      buildsPerDay: null,
      databaseBytes: null,
      idleSleepDays: null,
      showIndobaseBadge: false,
      customDomain: true,
      backendStudio: true,
      githubExport: true,
      priorityBuildQueue: true,
      sharedBilling: true,
      isolatedStack: true,
      builderPromptLimit: null,
    },
    platform: {
      planId: 'platform',
      displayName: 'Platform',
      priceInr: null,
      maxApps: null,
      maxSeats: null,
      buildsPerDay: null,
      databaseBytes: null,
      idleSleepDays: null,
      showIndobaseBadge: false,
      customDomain: true,
      backendStudio: true,
      githubExport: true,
      priorityBuildQueue: true,
      sharedBilling: true,
      isolatedStack: false,
      builderPromptLimit: null,
    },
  }

export function getPlanEntitlements(plan: string | null | undefined): PlanEntitlements {
  const key = entitlementsPlanKey(plan)
  return ENTITLEMENTS[key as keyof typeof ENTITLEMENTS] ?? ENTITLEMENTS.free
}

export function isPaidCheckoutPlan(plan: string | null | undefined): boolean {
  const id = entitlementsPlanKey(plan)
  return id === 'basic' || id === 'pro' || id === 'studio'
}

/** Razorpay subscription plans (excludes free / enterprise / platform). */
export const RAZORPAY_CHECKOUT_PLAN_IDS: IndobasePlanId[] = ['basic', 'pro', 'studio']

export function planRank(plan: string | null | undefined): number {
  const key = entitlementsPlanKey(plan)
  const order: Record<string, number> = {
    free: 0,
    basic: 1,
    pro: 2,
    studio: 3,
    enterprise: 4,
    platform: 5,
  }
  return order[key] ?? 0
}

export type PlanChangeType = 'upgrade' | 'downgrade' | 'none'

export function getPlanChangeType(
  fromPlan: string | null | undefined,
  toPlan: string | null | undefined
): PlanChangeType {
  const from = planRank(fromPlan)
  const to = planRank(toPlan)
  if (from === to) return 'none'
  return to > from ? 'upgrade' : 'downgrade'
}

export function assertFeatureAllowed(
  plan: string | null | undefined,
  feature: keyof Pick<
    PlanEntitlements,
    'customDomain' | 'backendStudio' | 'githubExport' | 'priorityBuildQueue'
  >
): { ok: true } | { ok: false; message: string; upgradeHint: string } {
  const e = getPlanEntitlements(plan)
  if (e[feature]) return { ok: true }

  const hints: Record<string, string> = {
    customDomain: 'Upgrade to Basic (₹499/mo) for a custom domain and badge removal.',
    backendStudio:
      'Upgrade to Basic (₹499/mo) to open Studio — manage Auth users, Postgres tables, Storage, and Edge Functions.',
    githubExport: 'Upgrade to Pro (₹1,999/mo) for GitHub export.',
    priorityBuildQueue: 'Upgrade to Studio (₹6,999/mo) for priority builds and team seats.',
  }

  return {
    ok: false,
    message: `Your ${e.displayName} plan does not include this feature.`,
    upgradeHint: hints[feature] ?? 'Upgrade your plan to unlock this feature.',
  }
}

export const SELECTABLE_BILLING_PLAN_IDS: IndobasePlanId[] = [
  'free',
  'basic',
  'pro',
  'studio',
  'enterprise',
]
