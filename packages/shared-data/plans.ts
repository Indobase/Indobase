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
      '512 MB database',
      'No Studio (Builder only)',
    ],
    footer: 'Upgrade to Basic to open Studio, add a custom domain, and remove the badge.',
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
    description: 'Studio unlocked — manage Auth, Database, Storage, and Functions.',
    motive: 'Open Studio + custom domain',
    preface: 'Everything in Free, plus:',
    features: [
      'Studio unlocked',
      'Auth, Postgres, Storage, Functions',
      '3 apps',
      'Custom domain',
      'Indobase badge removed',
      'No idle sleep',
      '~60 builds/day',
      '1 GB database',
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
    description: 'Production headroom — more apps, larger DB, and GitHub export.',
    motive: 'Necessity: scale past Basic',
    preface: 'Everything in Basic, plus:',
    features: [
      '5 apps',
      '~150 builds/day',
      '8 GB database',
      'GitHub export',
      'Isolated tenant stack',
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
      '~300 builds/day',
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
