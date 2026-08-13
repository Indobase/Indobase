/**
 * UX conductor — business language above the production conductor.
 *
 * The agent can be complex. The experience cannot.
 * Frozen tool surface stays five tools; this layer only names what the operator sees.
 */

export type BusinessAppKind = 'store' | 'app' | 'website' | 'booking' | 'ordering' | 'agency'

export type HomeIntent = {
  id: string
  kind: BusinessAppKind
  label: string
  description: string
  prompt: string
  appType: 'ecommerce' | 'saas' | 'landing'
}

/** User-facing home tiles. Prompts are business language — never tool names. */
export const HOME_INTENTS: readonly HomeIntent[] = [
  {
    id: 'launch-store',
    kind: 'store',
    label: 'Store',
    description: 'Sell online',
    appType: 'ecommerce',
    prompt: 'I want to launch an online store. Build a complete shop with products, cart, checkout, customer accounts, orders, and admin. Infer the rest and start building.',
  },
  {
    id: 'launch-saas',
    kind: 'app',
    label: 'SaaS',
    description: 'Launch app',
    appType: 'saas',
    prompt: 'I want to launch a SaaS app with customer accounts and saved data. Infer the rest and start building.',
  },
  {
    id: 'launch-landing',
    kind: 'website',
    label: 'Website',
    description: 'Grow brand',
    appType: 'landing',
    prompt: 'I want to launch a website for my brand. Make it look live-ready and publish when it is ready.',
  },
  {
    id: 'launch-booking',
    kind: 'booking',
    label: 'Booking',
    description: 'Take bookings',
    appType: 'saas',
    prompt: 'I want to launch a booking business so customers can reserve times. Infer the rest and start building.',
  },
  {
    id: 'launch-ordering',
    kind: 'ordering',
    label: 'Ordering',
    description: 'Take orders',
    appType: 'ecommerce',
    prompt: 'I want to launch an ordering site so customers can order and pay. Infer the rest and start building.',
  },
  {
    id: 'launch-agency',
    kind: 'agency',
    label: 'Agency',
    description: 'Get clients',
    appType: 'landing',
    prompt: 'I want to launch an agency website to get clients. Infer the rest and start building.',
  },
] as const

export const UX_HOME_HEADLINE = 'What do you want to launch?'
export const UX_HOME_SUBHEAD = 'Tell me what business you want. I will build it, show a preview, then launch it.'

export const PRODUCTION_JOB_STAGE_TITLES = {
  classify: 'Understanding your business',
  contract: 'Setting up your store',
  provision: 'Store foundation',
  generate: 'Building storefront',
  wire: 'Connecting checkout',
  verify: 'Quality checks',
  deploy: 'Publishing',
  smoke: 'Testing store',
  live: 'Live',
} as const

export type ProductionJobStageId = keyof typeof PRODUCTION_JOB_STAGE_TITLES

const JOURNEY_STAGE_LABELS = {
  account: 'Account',
  preview: 'Preview',
  backend: 'Store',
  live: 'Launch',
  payments: 'Payments',
  production: 'Ready',
} as const

export type UxJourneyFlags = {
  guest: boolean
  live: boolean
  backendReady: boolean
  paymentsReady: boolean
  liveUrl?: string | null
  appKind?: BusinessAppKind
}

export type UxAction = {
  label: string
  message: string
}

export function businessNoun(kind: BusinessAppKind = 'store'): string {
  if (kind === 'app' || kind === 'booking') return 'app'
  if (kind === 'website' || kind === 'agency') return 'website'
  return 'store'
}

export function appTypeToKind(appType?: string | null): BusinessAppKind {
  const t = (appType || '').toLowerCase()
  if (t === 'saas') return 'app'
  if (t === 'landing') return 'website'
  return 'store'
}

export function businessJobStageTitle(id: string, appType?: string | null): string {
  const kind = appTypeToKind(appType)
  const noun = businessNoun(kind)
  const titles: Record<string, string> = {
    classify: 'Understanding your business',
    contract: kind === 'store' ? 'Setting up your store' : `Setting up your ${noun}`,
    provision: kind === 'store' ? 'Store foundation' : `${noun[0].toUpperCase()}${noun.slice(1)} foundation`,
    generate: kind === 'store' ? 'Building storefront' : `Building ${noun}`,
    wire: kind === 'store' ? 'Connecting checkout' : 'Connecting accounts',
    verify: 'Quality checks',
    deploy: 'Publishing',
    smoke: kind === 'store' ? 'Testing store' : `Testing ${noun}`,
    live: 'Live',
  }
  return titles[id] || id
}

export function businessJourneyStageLabel(id: string): string {
  return JOURNEY_STAGE_LABELS[id as keyof typeof JOURNEY_STAGE_LABELS] || id
}

export function uxHeadline(flags: UxJourneyFlags): string {
  const noun = businessNoun(flags.appKind)
  if (flags.guest) return 'Create an account to launch'
  if (flags.live && flags.backendReady && flags.paymentsReady) {
    return `Your ${noun} is live`
  }
  if (flags.live && !flags.backendReady) {
    return `Your ${noun} is live — connect products & orders next`
  }
  if (flags.live && !flags.paymentsReady) {
    return `Your ${noun} is live — payments are optional until you connect them`
  }
  if (flags.backendReady) return `Preview ready — launch your ${noun} when you are`
  return `Tell me what to build — then watch the preview`
}

export function uxJobHeadline(input: {
  status: string
  appType?: string | null
  url?: string | null
  blockedMessage?: string | null
}): string {
  const noun = businessNoun(appTypeToKind(input.appType))
  if (input.status === 'blocked') {
    return input.blockedMessage?.trim() || 'Launch hit a snag — I can retry'
  }
  if (input.status === 'live' && input.url) return `Your ${noun} is live`
  if (input.status === 'awaiting_generate') return `Designing your ${noun}`
  return `Building your ${noun}`
}

/** 1–3 contextual actions. Labels are operator-facing; messages stay business language. */
export function uxContextualActions(flags: UxJourneyFlags): UxAction[] {
  if (flags.guest) {
    return [
      {
        label: 'Create account',
        message: 'Create my Indobase account so I can launch (name, email, and privacy consent).',
      },
    ]
  }
  if (flags.live && flags.backendReady && flags.paymentsReady) {
    return [
      { label: 'Open store', message: flags.liveUrl ? `Open my live store ${flags.liveUrl}` : 'Open my live store.' },
      { label: 'Manage store', message: 'Open store admin so I can manage products and orders.' },
    ].slice(0, 3)
  }
  if (flags.live && !flags.backendReady) {
    return [
      {
        label: 'Connect products & orders',
        message: 'Connect products, orders and inventory so this live site can take real orders.',
      },
      { label: 'Open preview', message: flags.liveUrl ? `Open my site ${flags.liveUrl}` : 'Open my live preview.' },
    ]
  }
  if (flags.live && !flags.paymentsReady) {
    return [
      {
        label: 'Connect payments',
        message:
          'Connect payments so customers can pay online. Ask whether I sell in India or internationally, then use my keys. Customers can still place orders without this.',
      },
      { label: 'Open store', message: flags.liveUrl ? `Open my live store ${flags.liveUrl}` : 'Open my live store.' },
      { label: 'Customize design', message: 'Make the storefront look more premium.' },
    ]
  }
  if (flags.backendReady) {
    return [
      { label: 'Launch store', message: 'Launch my store on Indobase now.' },
      { label: 'Preview store', message: 'Show me the preview of my store.' },
    ]
  }
  return [
    { label: 'Start building', message: 'Start building my business from what I described. Infer the rest.' },
  ]
}

export type BusinessReadinessItem = {
  id: string
  label: string
  status: 'ready' | 'warning' | 'pending'
}

export function businessReadiness(flags: UxJourneyFlags): BusinessReadinessItem[] {
  const live = flags.live
  const store = flags.backendReady
  return [
    { id: 'storefront', label: 'Storefront', status: live || store ? 'ready' : 'pending' },
    { id: 'products', label: 'Products', status: store ? 'ready' : 'pending' },
    { id: 'cart', label: 'Shopping cart', status: store ? 'ready' : 'pending' },
    { id: 'checkout', label: 'Checkout', status: store ? 'ready' : 'pending' },
    { id: 'customers', label: 'Customer accounts', status: store ? 'ready' : 'pending' },
    { id: 'orders', label: 'Orders', status: store ? 'ready' : 'pending' },
    { id: 'inventory', label: 'Inventory', status: store ? 'ready' : 'pending' },
    { id: 'payments', label: 'Payments', status: flags.paymentsReady ? 'ready' : live ? 'warning' : 'pending' },
    { id: 'security', label: 'Security checks', status: live && store ? 'ready' : 'pending' },
  ]
}

export const UX_CONDUCTOR_AGENT_RULES = `
## UX conductor (HARD — operator experience)

The agent can be complex. The experience cannot.
Speak only business language to the operator. Never name guidedBackend, ensureDatabase, applySchema, Commerce ABI, PocketBase, reservations, CAS, or job stage ids.

On a clear launch ask: infer architecture and start. Ask at most 1–2 high-value questions (name, currency, have products?). Do not ask about databases, auth, schema, storage, analytics, or payments unless they asked.

While launchProductionApp runs, describe progress as:
Understanding your business → Store foundation → Product catalog → Checkout → Storefront → Quality checks → Publishing.
Never quote raw stage ids.

Chips: **1–3** relevant actions only. Labels like Launch store / Preview / Connect payments / Open store.
After LIVE without payments: "Payments aren't connected yet. Customers can still place orders, but online payment won't be available."

Build (preview) is not Launch (live). Only claim live when the job status is live.
`.trim()
