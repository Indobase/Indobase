import type { PlanId } from 'data/subscriptions/types'

type PlanChangeType = 'upgrade' | 'downgrade' | 'none'

function getPlanChangeType(fromPlan: PlanId | undefined, toPlan: PlanId | undefined): PlanChangeType {
  const planChangeTypes: Record<PlanId, Record<PlanId, PlanChangeType>> = {
    free: { free: 'none', pro: 'upgrade', team: 'upgrade', enterprise: 'upgrade', platform: 'upgrade' },
    pro: { free: 'downgrade', pro: 'none', team: 'upgrade', enterprise: 'upgrade', platform: 'upgrade' },
    team: { free: 'downgrade', pro: 'downgrade', team: 'none', enterprise: 'upgrade', platform: 'upgrade' },
    enterprise: {
      free: 'downgrade',
      pro: 'downgrade',
      team: 'downgrade',
      enterprise: 'none',
      platform: 'upgrade',
    },
    platform: {
      free: 'downgrade',
      pro: 'downgrade',
      team: 'downgrade',
      enterprise: 'downgrade',
      platform: 'none',
    },
  }
  if (!fromPlan || !toPlan) return 'none'
  return planChangeTypes[fromPlan]?.[toPlan] ?? 'none'
}

export const INDOBASE_BILLING_CURRENCY = 'INR' as const

export const INDOBASE_PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: 'Starter',
  pro: 'Pro',
  team: 'Business',
  enterprise: 'Enterprise',
  platform: 'Platform',
}

/** Monthly prices in INR (paise not used — whole rupees). */
export const INDOBASE_PLAN_PRICES_INR: Record<PlanId, number | null> = {
  free: 0,
  pro: 2499,
  team: 49999,
  enterprise: null,
  platform: null,
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
}

export function getIndobasePublicPlans(currency: string = INDOBASE_BILLING_CURRENCY): IndobasePublicPlan[] {
  const isInr = currency === 'INR'

  const plans: IndobasePublicPlan[] = [
    {
      id: 'free',
      name: 'Starter',
      display_name: 'Starter',
      monthly_price: 0,
      annual_price: 0,
      currency,
      description: 'Perfect for trying out the platform',
      features: [
        'Unlimited API requests',
        '50,000 monthly active users',
        '500 MB database size',
        '5 GB egress',
        '5 GB cached egress',
        '1 GB file storage',
        'Community support',
      ],
      limits: {
        database_size: 536870912,
        auth_maus: 50000,
        storage_size: 1073741824,
        functions_invocations: 500000,
        realtime_connections: 200,
        realtime_messages: 2000000,
      },
      overage_rates: {
        database_size: isInr ? 0.000010417 : 0.000000125,
        auth_maus: isInr ? 0.27 : 0.00325,
        storage_size: isInr ? 1.75 : 0.021,
        functions_invocations: isInr ? 0.000167 : 0.000002,
      },
      popular: false,
      available: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      display_name: 'Pro',
      monthly_price: isInr ? 2499 : 25,
      annual_price: isInr ? 24990 : 240,
      currency,
      description: 'For growing applications and startups',
      features: [
        '100,000 monthly active users',
        '8 GB disk size per project',
        '250 GB egress',
        '250 GB cached egress',
        '100 GB file storage',
        'Email support',
        'Daily backups stored for 7 days',
        '7-day log retention',
      ],
      limits: {
        database_size: 8589934592,
        auth_maus: 100000,
        storage_size: 107374182400,
        functions_invocations: 2000000,
        realtime_connections: 500,
        realtime_messages: 5000000,
      },
      overage_rates: {
        database_size: isInr ? 0.000010417 : 0.000000125,
        auth_maus: isInr ? 0.27 : 0.00325,
        storage_size: isInr ? 1.75 : 0.021,
        functions_invocations: isInr ? 0.000167 : 0.000002,
      },
      popular: false,
      available: true,
      savings: isInr ? 'Save ₹4,998 with annual billing' : 'Save $60 with annual billing',
    },
    {
      id: 'team',
      name: 'Business',
      display_name: 'Business',
      monthly_price: isInr ? 49999 : 599,
      annual_price: isInr ? 479990 : 5750,
      currency,
      description: 'For scaling businesses with advanced needs',
      features: [
        'SOC2',
        'Project-scoped and read-only access',
        'HIPAA available as paid add-on',
        'SSO for Indobase Dashboard',
        'Priority email support & SLAs',
        'Daily backups stored for 14 days',
        '28-day log retention',
        'Add Log Drains',
      ],
      limits: {
        database_size: 8589934592,
        auth_maus: 100000,
        storage_size: 107374182400,
        functions_invocations: 2000000,
        realtime_connections: 500,
        realtime_messages: 5000000,
      },
      overage_rates: {
        database_size: isInr ? 0.000010417 : 0.000000125,
        auth_maus: isInr ? 0.27 : 0.00325,
        storage_size: isInr ? 1.75 : 0.021,
        functions_invocations: isInr ? 0.000167 : 0.000002,
      },
      popular: true,
      available: true,
      savings: isInr ? 'Save ₹119,998 with annual billing' : 'Save $1,438 with annual billing',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      display_name: 'Enterprise',
      monthly_price: null,
      annual_price: null,
      currency,
      description: 'Custom solutions for large organizations',
      features: [
        'Designated Support manager',
        'Uptime SLAs',
        'BYO Cloud supported',
        '24x7x365 premium enterprise support',
        'Private Slack channel',
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

export function getIndobaseOrgPlansResponse(currentPlanId: PlanId) {
  const selectable: PlanId[] = ['free', 'pro', 'team', 'enterprise']

  return {
    plans: selectable.map((id) => ({
      id,
      name: INDOBASE_PLAN_DISPLAY_NAMES[id],
      price: INDOBASE_PLAN_PRICES_INR[id] ?? 0,
      is_current: id === currentPlanId,
      change_type: getPlanChangeType(currentPlanId, id),
    })),
  }
}
