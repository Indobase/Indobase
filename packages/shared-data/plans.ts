export type PlanId = 'free' | 'pro' | 'team' | 'enterprise'

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
}

const CONTACT_SALES_PATH = '/contact-us/enterprise'

export const plans: PricingInformation[] = [
  {
    id: 'tier_free',
    planId: 'free',
    name: 'Starter',
    nameBadge: '',
    costUnit: '/ month',
    href: '/new?plan=free',
    priceLabel: '',
    priceMonthly: 0,
    description: 'Start building like a team of hundreds today.',
    preface: 'Get started with:',
    features: [
      'Unlimited API requests',
      '50,000 monthly active users',
      '500 MB database size',
      '5 GB egress',
      '5 GB cached egress',
      '1 GB file storage',
      'Community support',
    ],
    footer: 'Free projects are paused after 1 week of inactivity. Limit of 2 active projects.',
    cta: 'Free!',
  },
  {
    id: 'tier_pro',
    planId: 'pro',
    name: 'Pro',
    nameBadge: '',
    costUnit: '/ month',
    href: '/new?plan=pro',
    priceLabel: '',
    priceMonthly: 2499,
    description: 'For growing applications and startups.',
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
    preface: 'Everything in the Free Plan, plus:',
    cta: 'Get Started',
  },
  {
    id: 'tier_team',
    planId: 'team',
    name: 'Business',
    nameBadge: 'Most Popular',
    costUnit: '/ month',
    href: '/new?plan=team',
    priceLabel: '',
    priceMonthly: 49999,
    description: 'For scaling businesses with advanced needs.',
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
    preface: 'Everything in the Pro Plan, plus:',
    cta: 'Get Started',
  },
  {
    id: 'tier_enterprise',
    planId: 'enterprise',
    name: 'Enterprise',
    href: CONTACT_SALES_PATH,
    description: 'For large-scale applications running Internet scale workloads.',
    features: [
      'Designated Support manager',
      'Uptime SLAs',
      'BYO Cloud supported',
      '24×7×365 premium enterprise support',
      'Private Slack channel',
      'Custom Security Questionnaires',
    ],
    priceLabel: '',
    priceMonthly: 'Custom',
    preface: '',
    cta: 'Contact Us',
  },
] as const
