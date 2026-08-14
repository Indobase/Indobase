/**
 * UX conductor — business language above the production conductor.
 *
 * The agent can be complex. The experience cannot.
 * Frozen tool surface stays five tools; this layer only names what the operator sees.
 */

export type BusinessAppKind =
  | 'store'
  | 'app'
  | 'website'
  | 'landing'
  | 'booking'
  | 'ordering'
  | 'agency'
  | 'saas'
  | 'ecommerce'

export function isAppJourneyKind(kind?: BusinessAppKind | null): boolean {
  return kind === 'app' || kind === 'saas' || kind === 'booking'
}

export function isStoreJourneyKind(kind?: BusinessAppKind | null): boolean {
  return kind === 'store' || kind === 'ecommerce' || kind === 'ordering'
}

export function isWebsiteJourneyKind(kind?: BusinessAppKind | null): boolean {
  return kind === 'website' || kind === 'landing' || kind === 'agency'
}

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
    prompt: 'I want to launch a website for my brand. Make it look live-ready and launch when it is ready.',
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

/** Default (store) job titles — production conductor ids stay the same. */
export const PRODUCTION_JOB_STAGE_TITLES = {
  classify: 'Understanding your brand',
  contract: 'Creating your storefront',
  provision: 'Setting up products & inventory',
  generate: 'Building your pages',
  wire: 'Connecting checkout',
  verify: 'Testing your store',
  deploy: 'Preparing launch',
  smoke: 'Checking your store',
  live: 'Live',
} as const

export type ProductionJobStageId = keyof typeof PRODUCTION_JOB_STAGE_TITLES

export type WorkspaceProjectState =
  | 'empty'
  | 'building'
  | 'preview_ready'
  | 'production_ready'
  | 'publishing'
  | 'live'
  | 'needs_attention'

const STORE_JOB_TITLES: Record<string, string> = { ...PRODUCTION_JOB_STAGE_TITLES }

const SAAS_JOB_TITLES: Record<string, string> = {
  classify: 'Understanding your product',
  contract: 'Creating your interface',
  provision: 'Setting up accounts',
  generate: 'Building your application',
  wire: 'Connecting your data',
  verify: 'Testing core flows',
  deploy: 'Preparing launch',
  smoke: 'Testing core flows',
  live: 'Live',
}

const WEBSITE_JOB_TITLES: Record<string, string> = {
  classify: 'Understanding your brand',
  contract: 'Creating the design',
  provision: 'Writing your content',
  generate: 'Building your website',
  wire: 'Connecting your pages',
  verify: 'Checking responsiveness',
  deploy: 'Preparing launch',
  smoke: 'Checking responsiveness',
  live: 'Live',
}

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
  /** Confirmed reachable preview — never a constructed /live/{ref}/ path. */
  previewReady?: boolean
  liveUrl?: string | null
  appKind?: BusinessAppKind
}

export type UxAction = {
  label: string
  message: string
}

export function businessNoun(kind: BusinessAppKind = 'store'): string {
  if (isAppJourneyKind(kind)) return 'app'
  if (isWebsiteJourneyKind(kind)) return 'website'
  return 'store'
}

/** BusinessSpec.businessType is identity. Job/deploy appType must not invent a different kind. */
export function appTypeToKind(appType?: string | null): BusinessAppKind {
  const t = (appType || '').toLowerCase()
  if (t === 'saas' || t === 'app') return 'saas'
  if (t === 'landing' || t === 'website') return 'landing'
  if (t === 'ecommerce' || t === 'store' || t === 'shop') return 'ecommerce'
  return 'store'
}

export function jobTitlesForKind(kind: BusinessAppKind = 'store'): Record<string, string> {
  if (isAppJourneyKind(kind)) return SAAS_JOB_TITLES
  if (isWebsiteJourneyKind(kind)) return WEBSITE_JOB_TITLES
  return STORE_JOB_TITLES
}

export function businessJobStageTitle(id: string, appType?: string | null): string {
  const titles = jobTitlesForKind(appTypeToKind(appType))
  return titles[id] || id
}

export function businessJourneyStageLabel(id: string, kind?: BusinessAppKind): string {
  if (id === 'backend') {
    if (isAppJourneyKind(kind)) return 'App'
    if (isWebsiteJourneyKind(kind)) return 'Site'
    return 'Store'
  }
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
  if (flags.previewReady) return `Preview ready — launch your ${noun} when you are`
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
  const kind = flags.appKind || 'store'
  const noun = businessNoun(kind)
  const liveOpen = flags.liveUrl ? `Open my live ${noun} ${flags.liveUrl}` : `Open my live ${noun}.`
  if (flags.live && flags.backendReady && flags.paymentsReady) {
    return [
      { label: `Open ${noun}`, message: liveOpen },
      {
        label: `Manage ${noun}`,
        message: `Open admin so I can manage my ${noun}.`,
      },
    ].slice(0, 3)
  }
  if (flags.live && !flags.backendReady) {
    return isStoreJourneyKind(kind)
      ? [
          {
            label: 'Connect products & orders',
            message: 'Connect products, orders and inventory so this live site can take real orders.',
          },
          { label: 'Open preview', message: flags.liveUrl ? `Open my site ${flags.liveUrl}` : 'Open my live preview.' },
        ]
      : [
          { label: `Open ${noun}`, message: liveOpen },
          { label: 'Continue editing', message: `Continue editing the ${noun}.` },
        ]
  }
  if (flags.live && !flags.paymentsReady) {
    if (!isStoreJourneyKind(kind)) {
      return [
        { label: `Open ${noun}`, message: liveOpen },
        { label: 'Connect a domain', message: 'Connect a domain I already own.' },
      ]
    }
    return [
      {
        label: 'Connect payments',
        message:
          'Connect payments so customers can pay online. Ask whether I sell in India or internationally, then use my keys. Customers can still place orders without this.',
      },
      { label: 'Open store', message: liveOpen },
      { label: 'Customize design', message: 'Make the storefront look more premium.' },
    ]
  }
  if (flags.previewReady) {
    return [
      { label: `Launch ${noun}`, message: `Launch my ${noun} on Indobase now.` },
      { label: 'Continue editing', message: 'Continue editing the preview.' },
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
  const kind = flags.appKind
  if (isWebsiteJourneyKind(kind)) {
    return [
      { id: 'website', label: 'Website', status: live ? 'ready' : 'pending' },
      { id: 'content', label: 'Content', status: live ? 'ready' : 'pending' },
      { id: 'security', label: 'Security checks', status: live ? 'ready' : 'pending' },
    ]
  }
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

export type ProjectCapability =
  | 'commerce'
  | 'auth'
  | 'customers'
  | 'payments'
  | 'analytics'
  | 'storefront'
  | 'bookings'
  | 'services'
  | 'calendar'
  | 'content'
  | 'leads'
  | 'domains'
  | 'data'
  | 'activity'

export type ControlCenterSection = {
  id: string
  label: string
  capability: ProjectCapability | 'overview' | 'settings'
}

const CONTRACT_CAPABILITY_MAP: Record<string, ProjectCapability[]> = {
  product_catalogue: ['commerce', 'storefront'],
  cart: ['commerce'],
  checkout_commerce_abi: ['commerce'],
  inventory_reservations: ['commerce'],
  admin_orders: ['commerce'],
  payments_byok: ['payments'],
  auth: ['auth', 'customers'],
  user_profile: ['auth', 'customers'],
  database: ['data'],
  crud_foundation: ['data'],
  public_site: ['storefront', 'content'],
  seo_basics: ['content'],
  legal_links: ['content'],
}

export function projectCapabilities(input: {
  appType?: string | null
  kind?: BusinessAppKind
  backendReady?: boolean
  paymentsReady?: boolean
  contractCapabilityIds?: string[] | null
}): ProjectCapability[] {
  const kind = input.kind || appTypeToKind(input.appType)
  const found = new Set<ProjectCapability>()
  if (input.contractCapabilityIds?.length) {
    for (const id of input.contractCapabilityIds) {
      for (const cap of CONTRACT_CAPABILITY_MAP[id] || []) found.add(cap)
    }
  } else if (isAppJourneyKind(kind) && kind !== 'booking') {
    found.add('auth')
    found.add('customers')
    found.add('data')
    found.add('activity')
    found.add('storefront')
  } else if (isWebsiteJourneyKind(kind)) {
    found.add('storefront')
    found.add('content')
    found.add('leads')
    found.add('domains')
  } else if (kind === 'booking') {
    found.add('bookings')
    found.add('customers')
    found.add('services')
    found.add('calendar')
    found.add('auth')
  } else {
    found.add('commerce')
    found.add('storefront')
    found.add('auth')
    found.add('customers')
  }
  if (input.paymentsReady) found.add('payments')
  else if (isStoreJourneyKind(kind)) found.add('payments')
  if (input.backendReady && isAppJourneyKind(kind)) {
    found.add('auth')
    found.add('data')
  }
  return [...found]
}

export function controlCenterNav(
  kind: BusinessAppKind,
  capabilities: readonly ProjectCapability[],
): ControlCenterSection[] {
  const has = (id: ProjectCapability) => capabilities.includes(id)
  const nav: ControlCenterSection[] = [{ id: 'overview', label: 'Overview', capability: 'overview' }]
  if (isAppJourneyKind(kind) && kind !== 'booking') {
    if (has('auth') || has('customers')) nav.push({ id: 'users', label: 'Users', capability: 'auth' })
    if (has('data')) nav.push({ id: 'data', label: 'Data', capability: 'data' })
    if (has('activity')) nav.push({ id: 'activity', label: 'Activity', capability: 'activity' })
    nav.push({ id: 'application', label: 'Application', capability: 'storefront' })
  } else if (kind === 'booking') {
    if (has('bookings')) nav.push({ id: 'bookings', label: 'Bookings', capability: 'bookings' })
    if (has('customers')) nav.push({ id: 'customers', label: 'Customers', capability: 'customers' })
    if (has('services')) nav.push({ id: 'services', label: 'Services', capability: 'services' })
    if (has('calendar')) nav.push({ id: 'calendar', label: 'Calendar', capability: 'calendar' })
  } else if (isWebsiteJourneyKind(kind)) {
    nav.push({ id: 'website', label: 'Website', capability: 'storefront' })
    if (has('content')) nav.push({ id: 'content', label: 'Content', capability: 'content' })
    if (has('leads')) nav.push({ id: 'leads', label: 'Leads', capability: 'leads' })
    if (has('domains')) nav.push({ id: 'domains', label: 'Domains', capability: 'domains' })
  } else {
    if (has('commerce')) nav.push({ id: 'products', label: 'Products', capability: 'commerce' })
    if (has('commerce')) nav.push({ id: 'orders', label: 'Orders', capability: 'commerce' })
    if (has('customers') || has('auth')) nav.push({ id: 'customers', label: 'Customers', capability: 'customers' })
    nav.push({ id: 'storefront', label: 'Storefront', capability: 'storefront' })
    if (has('payments')) nav.push({ id: 'payments', label: 'Payments', capability: 'payments' })
  }
  nav.push({ id: 'settings', label: 'Settings', capability: 'settings' })
  return nav
}

export type PreviewEditIntent =
  | 'modify_copy'
  | 'change_image'
  | 'make_premium'
  | 'duplicate'
  | 'hide'
  | 'move'
  | 'delete'
  | 'edit'

export type PreviewEditTarget = {
  type: string
  id: string
  component: string
  label?: string
  source?: 'preview'
  text?: string | null
}

export type WorkspaceScreen = {
  section: string
  entityId?: string | null
  label?: string | null
}

export function previewEditSuggestions(target: PreviewEditTarget): UxAction[] {
  const name = target.label || target.component || 'this section'
  return [
    { label: 'Make it more premium', message: `Make the ${name} more premium.` },
    { label: 'Change headline', message: `Change the ${name} headline.` },
    { label: 'Change image', message: `Change the ${name} image.` },
  ]
}

export function previewSelectToEditMessage(target: PreviewEditTarget): string {
  const hay = `${target.id} ${target.label || ''} ${target.component || ''}`
  const isHero = /\b(hero|banner|header)\b/i.test(hay)
  return formatPreviewEditMessage({
    target,
    intent: isHero ? 'make_premium' : 'edit',
    request: isHero ? 'make hero more premium' : `Edit the ${target.label || target.component || 'section'}`,
  })
}

export function formatPreviewEditMessage(input: {
  target: PreviewEditTarget
  intent: PreviewEditIntent
  request: string
}): string {
  const request = input.request.trim()
  const label = input.target.label || input.target.component || input.target.id
  return [
    'PREVIEW_EDIT',
    `target: ${input.target.type} / ${input.target.id} (${input.target.component || label})`,
    'source: preview',
    `intent: ${input.intent}`,
    input.target.text ? `current: ${input.target.text}` : null,
    `request: ${request}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatScreenMessage(screen: WorkspaceScreen, request: string): string {
  const lines = ['SCREEN', `section: ${screen.section}`]
  if (screen.entityId) lines.push(`entity: ${screen.entityId}`)
  if (screen.label) lines.push(`label: ${screen.label}`)
  lines.push(`request: ${request.trim()}`)
  return lines.join('\n')
}

export function composeScreenHint(screen?: WorkspaceScreen | null): string {
  if (!screen?.section) return ''
  const entity = screen.entityId ? ` → ${screen.entityId}` : ''
  return [
    '## Current screen (HARD — operator is looking at this)',
    `The operator is on: ${screen.label || screen.section}${entity}.`,
    'If they omit identifiers, use this screen. Do not ask which section they mean.',
    'Answer products/orders from BusinessRuntimeState. Never say the product or orders connection is unavailable when the runtime lists them.',
  ].join('\n')
}

export type AuthoritativeProject = {
  state: WorkspaceProjectState
  kind: BusinessAppKind
  capabilities: ProjectCapability[]
  nav: ControlCenterSection[]
}

export type WorkspaceSnapshot = {
  guest?: boolean
  live?: boolean
  liveUrl?: string | null
  previewUrl?: string | null
  /** Hard gate — a URL string is not enough. */
  previewReady?: boolean
  previewStatus?: 'absent' | 'building' | 'ready' | 'failed'
  backendReady?: boolean
  paymentsReady?: boolean
  jobStatus?: string | null
  jobStage?: string | null
  appType?: string | null
  failureCode?: string | null
  failureMessage?: string | null
  repairable?: boolean
  stages?: Array<{ id: string; status: string; title?: string }>
  contractCapabilityIds?: string[] | null
  screen?: WorkspaceScreen | null
  displayName?: string | null
  /** When set, UI must project this — never invent a parallel isLive/hasCommerce. */
  authority?: AuthoritativeProject | null
}

export type HumanLaunchFailure = {
  title: string
  body: string
  code: string
  repairable: boolean
  actions: UxAction[]
}

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
  backend_required: {
    title: "I couldn't safely launch this yet.",
    body: "Your customer accounts aren't connected to the application.",
  },
  account_required: {
    title: 'Create an account to launch.',
    body: 'I need you signed in before this can go live.',
  },
  wire_required: {
    title: "I couldn't safely launch this yet.",
    body: "Checkout isn't connected to the storefront yet.",
  },
  contract_verifier_failed: {
    title: "I couldn't safely launch this yet.",
    body: "A required part of the application isn't ready.",
  },
  functional_verifier_failed: {
    title: "I couldn't safely launch this yet.",
    body: "A customer flow (like cart or checkout) didn't work correctly.",
  },
  gateway_not_ready: {
    title: "Payments aren't connected yet.",
    body: "Customers can still place orders, but online payment won't be available until you add your payment keys.",
  },
  payments_byok_required: {
    title: "Payments aren't connected yet.",
    body: "Customers can still place orders, but online payment won't be available until you add your payment keys.",
  },
  launch_blocked: {
    title: 'Launch paused',
    body: "I found an issue I couldn't safely resolve automatically.",
  },
  smoke_failed: {
    title: "I couldn't safely launch this yet.",
    body: "The live site didn't respond correctly when I checked it.",
  },
  deploy_failed: {
    title: "I couldn't safely launch this yet.",
    body: "I couldn't put your site live at your Indobase address.",
  },
}

export function stripInternalFailureCopy(message: string): string {
  return message
    .replace(/^LAUNCH BLOCKED\s*[—–-]\s*/i, '')
    .replace(/^production verification failed:\s*/i, '')
    .replace(
      /\b(backend_required|wire_required|account_required|contract_verifier_failed|functional_verifier_failed|guidedBackend|ensureDatabase|applySchema|PocketBase|Commerce ABI|CAS|payment_revision|compare-and-set|Studio|tenant|provisioner|Coolify|Traefik|Docker|Postgres)\b/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/^[:.—–-]+\s*/, '')
    .trim()
}

export function humanizeLaunchFailure(input: {
  code?: string | null
  message?: string | null
  repairable?: boolean
}): HumanLaunchFailure {
  const code = (input.code || 'launch_blocked').trim() || 'launch_blocked'
  const known = FAILURE_COPY[code]
  const repairable = input.repairable !== false && code !== 'account_required'
  const stripped = input.message ? stripInternalFailureCopy(input.message) : ''
  const title = known?.title || "I couldn't safely launch this yet."
  const body =
    known?.body || stripped || 'I found an issue I need to fix before this can go live.'
  const actions: UxAction[] = repairable
    ? [
        {
          label: 'Fix it automatically',
          message: 'Fix the launch issue automatically and continue. Retry the same launch.',
        },
        { label: 'Continue editing', message: 'Continue editing the preview.' },
      ]
    : [
        { label: 'Try again', message: 'Try launching again.' },
        { label: 'Continue editing', message: 'Continue editing the preview.' },
      ]
  if (code === 'account_required') {
    return {
      title,
      body,
      code,
      repairable: false,
      actions: [
        {
          label: 'Create account',
          message: 'Create my Indobase account so I can launch (name, email, and privacy consent).',
        },
      ],
    }
  }
  return { title, body, code, repairable, actions: actions.slice(0, 3) }
}

export function resolveWorkspaceState(input: WorkspaceSnapshot): WorkspaceProjectState {
  if (input.jobStatus === 'blocked' || (input.failureCode && input.jobStatus !== 'live')) {
    return 'needs_attention'
  }
  if (input.jobStatus === 'live' || (input.live && input.liveUrl)) return 'live'
  const stage = (input.jobStage || '').toLowerCase()
  if (
    input.jobStatus === 'running' &&
    (stage === 'deploy' || stage === 'smoke' || stage === 'live')
  ) {
    return 'publishing'
  }
  if (
    input.jobStatus === 'queued' ||
    input.jobStatus === 'running' ||
    input.jobStatus === 'awaiting_generate'
  ) {
    return 'building'
  }
  const previewReady = input.previewReady === true || input.previewStatus === 'ready'
  if (input.backendReady && previewReady && !input.live) return 'production_ready'
  if (previewReady && !input.live) return 'preview_ready'
  if (input.backendReady && !previewReady) return 'building'
  return 'empty'
}

export type WorkspaceStageView = {
  id: string
  label: string
  status: 'done' | 'current' | 'upcoming'
}

export type WorkspaceViewModel = {
  state: WorkspaceProjectState
  kind: BusinessAppKind
  noun: string
  kicker: string
  headline: string
  body: string
  previewUrl: string | null
  liveUrl: string | null
  actions: UxAction[]
  stages: WorkspaceStageView[]
  failure: HumanLaunchFailure | null
  showPreview: boolean
  previewHint: string
  capabilities: ProjectCapability[]
  nav: ControlCenterSection[]
  showControlCenter: boolean
}

function mapWorkspaceStages(
  stages: WorkspaceSnapshot['stages'],
  appType?: string | null,
): WorkspaceStageView[] {
  if (!stages?.length) return []
  return stages.map((s) => ({
    id: s.id,
    label: businessJobStageTitle(s.id, appType),
    status:
      s.status === 'ok' || s.status === 'skipped'
        ? ('done' as const)
        : s.status === 'running' || s.status === 'failed'
          ? ('current' as const)
          : ('upcoming' as const),
  }))
}

export function viewProjectsAuthority(view: WorkspaceViewModel, authority: AuthoritativeProject): boolean {
  return (
    view.state === authority.state &&
    view.kind === authority.kind &&
    view.capabilities.join('|') === authority.capabilities.join('|') &&
    view.nav.map((n) => n.id).join('|') === authority.nav.map((n) => n.id).join('|')
  )
}

export function workspaceViewModel(input: WorkspaceSnapshot): WorkspaceViewModel {
  let kind = appTypeToKind(input.appType)
  let state = resolveWorkspaceState(input)
  let capabilities = projectCapabilities({
    appType: input.appType,
    kind,
    backendReady: input.backendReady,
    paymentsReady: input.paymentsReady,
    contractCapabilityIds: input.contractCapabilityIds,
  })
  let nav = controlCenterNav(kind, capabilities)
  if (input.authority) {
    state = input.authority.state
    kind = input.authority.kind
    capabilities = input.authority.capabilities
    nav = input.authority.nav
  }
  const noun = businessNoun(kind)
  const liveUrl = input.liveUrl || null
  const previewReady = input.previewReady === true || input.previewStatus === 'ready' || state === 'live'
  const previewUrl = previewReady
    ? (input.previewUrl && input.previewUrl.includes('/live/') ? input.previewUrl : null) ||
      input.previewUrl ||
      liveUrl ||
      null
    : null
  const stages = mapWorkspaceStages(input.stages, input.appType)
  const flags: UxJourneyFlags = {
    guest: Boolean(input.guest),
    live: Boolean(state === 'live' || input.live),
    backendReady: input.authority
      ? input.authority.capabilities.some((c) => c === 'commerce' || c === 'auth' || c === 'data')
      : Boolean(input.backendReady),
    paymentsReady: input.authority
      ? input.authority.capabilities.includes('payments')
      : Boolean(input.paymentsReady),
    previewReady,
    liveUrl,
    appKind: kind,
  }
  const failure =
    state === 'needs_attention'
      ? humanizeLaunchFailure({
          code: input.failureCode,
          message: input.failureMessage,
          repairable: input.repairable,
        })
      : null
  const base = { capabilities, nav, showControlCenter: state === 'live' }

  if (state === 'empty') {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'Indobase',
      headline: UX_HOME_HEADLINE,
      body: UX_HOME_SUBHEAD,
      previewUrl: null,
      liveUrl: null,
      actions: HOME_INTENTS.slice(0, 3).map((t) => ({ label: t.label, message: t.prompt })),
      stages: [],
      failure: null,
      showPreview: true,
      previewHint: 'Your preview will appear here as we build.',
      showControlCenter: false,
    }
  }

  if (state === 'building') {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'Building',
      headline: `Building your ${noun}…`,
      body: 'Watch the preview update as each part lands.',
      previewUrl,
      liveUrl: null,
      actions: [],
      stages,
      failure: null,
      showPreview: true,
      previewHint: previewUrl ? 'Updating preview…' : 'Creating your preview…',
      showControlCenter: false,
    }
  }

  if (state === 'publishing') {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'Launch',
      headline: `Publishing your ${noun}…`,
      body: 'Final checks, then your live link.',
      previewUrl,
      liveUrl: null,
      actions: [],
      stages,
      failure: null,
      showPreview: true,
      previewHint: 'Going live…',
      showControlCenter: false,
    }
  }

  if (state === 'needs_attention' && failure) {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'Needs attention',
      headline: failure.title,
      body: failure.body,
      previewUrl,
      liveUrl,
      actions: failure.actions,
      stages,
      failure,
      showPreview: Boolean(previewUrl),
      previewHint: 'Launch paused until this is fixed.',
      showControlCenter: false,
    }
  }

  if (state === 'live') {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'LIVE',
      headline: `Your ${noun} is live`,
      body: liveUrl || `Your ${noun} is on Indobase.`,
      previewUrl: liveUrl || previewUrl,
      liveUrl,
      actions: uxContextualActions(flags),
      stages,
      failure: null,
      showPreview: true,
      previewHint: 'Click anything to change it — or manage the business here.',
      showControlCenter: true,
    }
  }

  if (state === 'production_ready') {
    return {
      ...base,
      state,
      kind,
      noun,
      kicker: 'Ready',
      headline: 'Everything is ready.',
      body: `Your ${noun} can go live when you are.`,
      previewUrl,
      liveUrl: null,
      actions: [
        { label: `Launch ${noun}`, message: `Launch my ${noun} on Indobase now.` },
        { label: 'Continue editing', message: 'Continue editing the preview.' },
      ],
      stages,
      failure: null,
      showPreview: true,
      previewHint: 'Click a section to change it, then launch.',
      showControlCenter: false,
    }
  }

  return {
    ...base,
    state: 'preview_ready',
    kind,
    noun,
    kicker: 'Preview',
    headline: `Your ${noun} is ready to review.`,
    body: 'Keep editing, or launch when it looks right.',
    previewUrl,
    liveUrl: null,
    actions: [
      { label: 'Continue editing', message: 'Continue editing the preview.' },
      { label: `Launch ${noun}`, message: `Launch my ${noun} on Indobase now.` },
    ],
    stages,
    failure: null,
    showPreview: true,
    previewHint: 'Click anything in the preview to change it.',
    showControlCenter: false,
  }
}

export const UX_CONDUCTOR_AGENT_RULES = `
## UX conductor (HARD — operator experience)

The agent can be complex. The experience cannot.
Speak only business language to the operator. Never name Studio, tenant, project, provisioner, guidedBackend, ensureDatabase, applySchema, Commerce ABI, PocketBase, Coolify, Docker, Traefik, Postgres, reservations, CAS, or job stage ids.
Never quote raw failure codes (backend_required, wire_required, contract_verifier_failed). Say what the customer cannot do yet, then offer Fix it automatically / Try again / Continue editing.

On a clear launch ask: infer architecture and start. Ask at most 1–2 high-value questions (name, currency, have products?). Do not ask about databases, auth, schema, storage, analytics, or payments unless they asked.

The operator sees chat beside a live preview. They can click a section in the preview; that sends a PREVIEW_EDIT block (target + intent + request). The target is authoritative — do not ask which element they meant. After the change, reply in one short sentence: “Done — I updated the hero.” They should see it in the preview immediately.

When a message starts with SCREEN, the operator is on that Control Center section (and optional entity). Use it. Example: SCREEN / section: orders / entity: 1042 / request: Refund this → refund order 1042.

Click-to-edit and Control Center are the same chat pipeline. Do not call a new tool for them. Visual UI still exists — do not tell them to “only ask AI” for products/orders.

While launchProductionApp runs, describe progress in the vocabulary for that business:
Store: Understanding your brand → Creating your storefront → Setting up products & inventory → Connecting checkout → Testing your store → Preparing launch.
SaaS: Understanding your product → Creating your interface → Setting up accounts → Connecting your data → Testing core flows → Preparing launch.
Website: Understanding your brand → Creating the design → Writing your content → Checking responsiveness → Preparing launch.
Never quote raw stage ids.

Chips: **1–3** relevant actions only. Labels like Launch store / Preview / Connect payments / Open store / Manage store.
After LIVE: chat stays on the Control Center. The operator can keep asking (“add 20 products”, “show today’s orders”, “change the homepage”). Do not send them away to a different product. Honor SCREEN / PREVIEW_EDIT context.
After LIVE without payments: "Payments aren't connected yet. Customers can still place orders, but online payment won't be available."

Build (preview) is not Launch (live). Only claim live when the job status is live.

## Execution integrity (HARD)

session.runtime (BusinessRuntimeState) is the only truth this turn.
Never mark preview done because you described a design. Never say “launch service unavailable” — call launchProductionApp.
Never tell the operator to refresh. After OTP, continue their original request immediately.
After LIVE, answer SCREEN order/product questions from BusinessRuntimeState.orders / products. Do not invent a missing-database story when the runtime lists the entity.
`.trim()
