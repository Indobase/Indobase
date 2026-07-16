export type PlanId = 'free' | 'basic' | 'pro' | 'studio' | 'team' | 'enterprise'

export interface PricingInformation {
  id: string
  planId: PlanId
  name: string
  nameBadge?: string
  costUnit?: string
  href: string
  priceLabel?: string
  priceMonthly: number | string
  warning?: string
  warningTooltip?: string
  description: string
  preface: string
  features: (string | string[])[]
  footer?: string
  cta: string
  motive?: string
}

const CONTACT_SALES_PATH = '/contact-us/enterprise'

export const plans: PricingInformation[] = [
  {
    id: 'tier_free',
    planId: 'free',
    name: 'Free',
    nameBadge: '',
    costUnit: '/ month',
    href: '/new?plan=free',
    priceLabel: '',
    priceMonthly: 0,
    description: 'One app on *.indobase.app — try Indobase before you commit.',
    motive: 'Try the product',
    preface: 'Includes:',
    features: [
      '1 app',
      '*.indobase.app subdomain',
      'Indobase badge on published sites',
      'Sleeps after 7 days idle',
      '~20 builds/day',
      'No backend Studio (frontend only)',
    ],
    footer: 'Upgrade to Basic when you want your own domain and no badge.',
    cta: 'Start free',
  },
  {
    id: 'tier_basic',
    planId: 'basic',
    name: 'Basic',
    nameBadge: '',
    costUnit: '/ month',
    href: '/new?plan=basic',
    priceLabel: '',
    priceMonthly: 499,
    description: 'Custom domain and no badge — for static sites, landings, and frontend prototypes.',
    motive: 'Vanity: my domain, no badge',
    preface: 'Everything in Free, plus:',
    features: [
      '3 apps',
      'Custom domain',
      'Indobase badge removed',
      'No idle sleep',
      '~60 builds/day',
      'No backend Studio (frontend only)',
    ],
    cta: 'Get Basic',
  },
  {
    id: 'tier_pro',
    planId: 'pro',
    name: 'Pro',
    nameBadge: 'Most Popular',
    costUnit: '/ month',
    href: '/new?plan=pro',
    priceLabel: '',
    priceMonthly: 1999,
    description: 'Backend Studio unlocked — Auth, Postgres, Storage, and Edge Functions.',
    motive: 'Necessity: users need to log in',
    preface: 'Everything in Basic, plus:',
    features: [
      'Backend Studio unlocked',
      'Auth, Postgres, Storage, Functions',
      '5 apps',
      'Unlimited builds (fair-use)',
      'GitHub export',
      '2 GB database',
    ],
    cta: 'Get Pro',
  },
  {
    id: 'tier_studio',
    planId: 'studio',
    name: 'Studio',
    nameBadge: '',
    costUnit: '/ month',
    href: '/new?plan=studio',
    priceLabel: '',
    priceMonthly: 6999,
    description: 'For agencies and dev shops — seats, more apps, and shared billing.',
    motive: 'Team: seats and shared billing',
    preface: 'Everything in Pro, plus:',
    features: [
      '3 seats',
      '15 apps',
      '20 GB database',
      'Priority build queue',
      'Shared billing',
    ],
    cta: 'Get Studio',
  },
  {
    id: 'tier_enterprise',
    planId: 'enterprise',
    name: 'Enterprise',
    href: CONTACT_SALES_PATH,
    description: 'DPDP audit pack, SLA, dedicated placement, VPC, and SSO. From ₹40,000/mo.',
    motive: 'Compliance and dedicated ops',
    features: [
      'DPDP audit pack',
      'Uptime SLA',
      'Dedicated placement / VPC',
      'SSO',
      '24×7 premium support',
    ],
    priceMonthly: 'Custom',
    preface: '',
    cta: 'Contact Us',
  },
]
