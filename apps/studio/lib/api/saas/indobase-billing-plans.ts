import type { PlanId } from 'data/subscriptions/types'

import {
  SELECTABLE_BILLING_PLAN_IDS,
  canonicalizePlanId,
  getPlanChangeType,
  getPlanEntitlements,
  type IndobasePlanId,
} from './plan-entitlements'

export type PlanChangeType = 'upgrade' | 'downgrade' | 'none'

export { getPlanChangeType }

export const INDOBASE_BILLING_CURRENCY = 'INR' as const

export const INDOBASE_PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  studio: 'Studio',
  team: 'Studio', // legacy
  enterprise: 'Enterprise',
  platform: 'Platform',
}

/** Monthly prices in INR — defaults before env overrides. */
export const INDOBASE_PLAN_PRICES_INR: Record<string, number | null> = {
  free: 0,
  basic: 499,
  pro: 1999,
  studio: 6999,
  team: 6999, // legacy alias
  enterprise: null,
  platform: null,
}

/**
 * Effective monthly INR for a plan. Operators can set `INDOBASE_<PLAN>_PLAN_PRICE_INR`
 * (e.g. `INDOBASE_BASIC_PLAN_PRICE_INR=499`) without redeploying code.
 */
export function resolveIndobasePlanPriceInr(planId: PlanId | IndobasePlanId | string): number | null {
  const id = canonicalizePlanId(planId)
  const key = id === 'team' ? 'studio' : id
  const base = INDOBASE_PLAN_PRICES_INR[key] ?? null
  const envKey = `INDOBASE_${key.toUpperCase()}_PLAN_PRICE_INR`
  const raw = process.env[envKey]?.trim()
  if (raw === undefined || raw === '') return base
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return base
  return n
}

export type IndobasePublicPlan = {
  id: string
  name: string
  display_name: string
  monthly_price: number | null
  annual_price: number | null
  currency: string
  description: string
  features: string[]
  limits: Record<string, number>
  overage_rates: Record<string, number>
  popular: boolean
  available: boolean
  savings?: string
  contact_sales?: boolean
  gst_notice?: string
  payment_methods?: string[]
  motive?: string
}

export function getIndobasePublicPlans(currency: string = INDOBASE_BILLING_CURRENCY): IndobasePublicPlan[] {
  const isInr = currency === 'INR'
  const e = {
    free: getPlanEntitlements('free'),
    basic: getPlanEntitlements('basic'),
    pro: getPlanEntitlements('pro'),
    studio: getPlanEntitlements('studio'),
  }

  const plans: IndobasePublicPlan[] = [
    {
      id: 'free',
      name: 'Free',
      display_name: 'Free',
      monthly_price: 0,
      annual_price: 0,
      currency,
      description: 'Ship one app on a *.indobase.app subdomain and see if Indobase fits.',
      motive: 'Try the product',
      features: [
        '1 app',
        '*.indobase.app subdomain',
        'Indobase badge on published sites',
        'Sleeps after 7 days idle',
        '~20 builds/day',
        'No backend Studio (frontend only)',
      ],
      limits: {
        max_apps: e.free.maxApps ?? 1,
        builds_per_day: e.free.buildsPerDay ?? 20,
      },
      overage_rates: {},
      popular: false,
      available: true,
    },
    {
      id: 'basic',
      name: 'Basic',
      display_name: 'Basic',
      monthly_price: isInr ? resolveIndobasePlanPriceInr('basic') ?? 499 : 6,
      annual_price: isInr ? (resolveIndobasePlanPriceInr('basic') ?? 499) * 10 : 60,
      currency,
      description: 'Custom domain and no badge — for static sites, landings, and frontend prototypes.',
      motive: 'Vanity: my domain, no badge',
      features: [
        '3 apps',
        'Custom domain',
        'Indobase badge removed',
        'No idle sleep',
        '~60 builds/day',
        'No backend Studio (frontend only)',
      ],
      limits: {
        max_apps: e.basic.maxApps ?? 3,
        builds_per_day: e.basic.buildsPerDay ?? 60,
      },
      overage_rates: {},
      popular: false,
      available: true,
      savings: (() => {
        if (!isInr) return undefined
        const m = resolveIndobasePlanPriceInr('basic') ?? 499
        return `Save ₹${(m * 2).toLocaleString('en-IN')} with annual billing`
      })(),
    },
    {
      id: 'pro',
      name: 'Pro',
      display_name: 'Pro',
      monthly_price: isInr ? resolveIndobasePlanPriceInr('pro') ?? 1999 : 24,
      annual_price: isInr ? (resolveIndobasePlanPriceInr('pro') ?? 1999) * 10 : 240,
      currency,
      description: 'Backend Studio unlocked — Auth, Postgres, Storage, and Edge Functions.',
      motive: 'Necessity: users need to log in',
      features: [
        'Backend Studio unlocked',
        'Auth, Postgres, Storage, Functions',
        '5 apps',
        'Unlimited builds (fair-use)',
        'GitHub export',
        '2 GB database',
      ],
      limits: {
        max_apps: e.pro.maxApps ?? 5,
        database_size: e.pro.databaseBytes ?? 2 * 1024 ** 3,
        auth_maus: 100000,
        storage_size: 107374182400,
      },
      overage_rates: {
        database_size: isInr ? 0.000010417 : 0.000000125,
        auth_maus: isInr ? 0.27 : 0.00325,
        storage_size: isInr ? 1.75 : 0.021,
      },
      popular: true,
      available: true,
      savings: (() => {
        if (!isInr) return 'Save with annual billing'
        const m = resolveIndobasePlanPriceInr('pro') ?? 1999
        const save = m * 12 - m * 10
        return `Save ₹${save.toLocaleString('en-IN')} with annual billing`
      })(),
    },
    {
      id: 'studio',
      name: 'Studio',
      display_name: 'Studio',
      monthly_price: isInr ? resolveIndobasePlanPriceInr('studio') ?? 6999 : 84,
      annual_price: isInr ? Math.round((resolveIndobasePlanPriceInr('studio') ?? 6999) * 9.6) : 800,
      currency,
      description: 'For agencies and dev shops — seats, more apps, and shared billing.',
      motive: 'Team: seats and shared billing',
      features: [
        '3 seats',
        '15 apps',
        '20 GB database',
        'Priority build queue',
        'Shared billing',
        'Everything in Pro',
      ],
      limits: {
        max_apps: e.studio.maxApps ?? 15,
        max_seats: e.studio.maxSeats ?? 3,
        database_size: e.studio.databaseBytes ?? 20 * 1024 ** 3,
      },
      overage_rates: {
        database_size: isInr ? 0.000010417 : 0.000000125,
      },
      popular: false,
      available: true,
      savings: (() => {
        if (!isInr) return undefined
        const m = resolveIndobasePlanPriceInr('studio') ?? 6999
        const annual = Math.round(m * 9.6)
        const save = m * 12 - annual
        return `Save ₹${save.toLocaleString('en-IN')} with annual billing`
      })(),
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      display_name: 'Enterprise',
      monthly_price: null,
      annual_price: null,
      currency,
      description: 'DPDP audit pack, SLA, dedicated placement, VPC, and SSO. From ₹40,000/mo.',
      motive: 'Compliance and dedicated ops',
      features: [
        'DPDP audit pack',
        'Uptime SLA',
        'Dedicated placement / VPC',
        'SSO',
        '24×7 premium support',
        'Custom security questionnaires',
      ],
      limits: {},
      overage_rates: {},
      popular: false,
      available: true,
      contact_sales: true,
    },
  ]

  if (isInr) {
    plans.forEach((plan) => {
      if (plan.contact_sales) return
      plan.gst_notice = '+ 18% GST applicable'
      plan.payment_methods = [
        'UPI (Google Pay, PhonePe, Paytm)',
        'Credit/Debit Cards (RuPay, Visa, Mastercard)',
        'Net Banking',
        'Digital Wallets',
        'EMI available for annual plans',
      ]
    })
  }

  return plans
}

export function getIndobaseOrgPlansResponse(currentPlanId: PlanId | string) {
  const current = canonicalizePlanId(currentPlanId)

  return {
    plans: SELECTABLE_BILLING_PLAN_IDS.map((id) => ({
      id,
      name: INDOBASE_PLAN_DISPLAY_NAMES[id],
      price: resolveIndobasePlanPriceInr(id) ?? 0,
      is_current: entitlementsPlanKeyEquals(current, id),
      change_type: getPlanChangeType(current, id),
    })),
  }
}

function entitlementsPlanKeyEquals(current: IndobasePlanId, id: IndobasePlanId): boolean {
  if (current === id) return true
  if ((current === 'team' || current === 'studio') && (id === 'team' || id === 'studio')) return true
  return false
}
