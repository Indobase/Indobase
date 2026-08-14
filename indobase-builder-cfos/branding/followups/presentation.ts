/**
 * Operator presentation — projection of BusinessRuntimeState + execution.
 * Not a second source of truth. Chat, Control Center, and chips consume this.
 * Pure TypeScript — copied into CFOS workshop-frontend by rebrand.
 */

import {
  appTypeToKind,
  businessNoun,
  controlCenterNav,
  humanizeLaunchFailure,
  isAppJourneyKind,
  isStoreJourneyKind,
  isWebsiteJourneyKind,
  projectCapabilities,
  type BusinessAppKind,
  type ControlCenterSection,
  type HumanLaunchFailure,
  type ProjectCapability,
  type UxAction,
} from './ux-conductor'

/** Structural slice of BusinessRuntimeState the UI may read. */
export type RuntimeView = {
  business: { name: string; kind: string; state?: string }
  spec?: { businessName?: string; businessType?: string; currency?: string; verticalId?: string } | null
  preview: { status: string; url: string | null }
  live: { isLive: boolean; url: string | null }
  products?: Array<{
    id?: string
    name?: string
    priceMinor?: number
    stock?: number
    variants?: Array<{ id?: string; priceMinor?: number; stock?: number }>
  }>
  customers?: Array<{ id?: string }>
  orders?: Array<{
    id?: string
    orderNumber?: string
    status?: string
    paymentStatus?: string
    amountMinor?: number
    createdAt?: string
  }>
  catalog: { productCount: number }
  commerce: {
    orderCount: number
    pendingOrderCount?: number
    todayOrderCount?: number
    todayRevenueMinor?: number
    timezone?: string
  }
  health: { catalogReady: boolean; paymentsReady: boolean; previewReady?: boolean }
  events: Array<{ kind: string }>
}

export const LIFECYCLE_STAGES = ['BUILD', 'PREVIEW', 'READY', 'LIVE', 'OPERATING'] as const
export type LifecycleStageId = (typeof LIFECYCLE_STAGES)[number]

export type StreamPhase = 'THINKING' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'BLOCKED' | 'IDLE'

export type ExecutionCardKind = 'building' | 'updated' | 'publishing' | 'live' | 'blocked'

export type PresentationMetric = {
  id: string
  label: string
  value: string
}

export type PresentationProductRow = {
  name: string
  variantCount: number
  price: string
  stock?: number
}

export type PresentationOrderRow = {
  id: string
  status: string
  amount: string
  createdAt: string | null
}

export const CONTROL_CENTER_LIST_LIMIT = 12

export type PresentationSurface = {
  lifecycle: {
    current: LifecycleStageId
    stages: Array<{ id: LifecycleStageId; label: string; status: 'done' | 'current' | 'upcoming' }>
  }
  stream: { phase: StreamPhase; label: string }
  executionCard: {
    kind: ExecutionCardKind
    title: string
    body: string
    fromStep: boolean
  } | null
  home: {
    name: string
    typeLabel: string
    kind: BusinessAppKind
    metrics: PresentationMetric[]
    checkoutStatus: string | null
    paymentsStatus: string | null
    previewUrl: string | null
    liveUrl: string | null
    empty: boolean
    loading: boolean
    error: string | null
    products: PresentationProductRow[]
    orders: PresentationOrderRow[]
  }
  actions: UxAction[]
  control: {
    show: boolean
    nav: ControlCenterSection[]
    capabilities: ProjectCapability[]
    products: PresentationProductRow[]
    orders: PresentationOrderRow[]
  }
  copy: {
    headline: string
    body: string
    liveBanner: string | null
  }
  failure: HumanLaunchFailure | null
}

const INTERNAL_LEAK =
  /\b(launchBusiness|launchProductionApp|placeTestShopOrder|guidedBackend|ensureDatabase|ensureLogin|applySchema|PocketBase|projectRef|executeProductionLaunchJob|Commerce ABI|jobId|plj_|operationId)\b/i

export function presentsInternalLeak(text: string): boolean {
  return INTERNAL_LEAK.test(text || '')
}

export function translateOperatorCopy(text: string): string {
  if (!text) return text
  let t = text
  t = t.replace(/\blaunchProductionApp\b/gi, '')
  t = t.replace(/\blaunchBusiness\b/gi, '')
  t = t.replace(/\bplaceTestShopOrder\b/gi, '')
  t = t.replace(/\bguidedBackend\b/gi, '')
  t = t.replace(/\bensureDatabase\b/gi, '')
  t = t.replace(/\bensureLogin\b/gi, '')
  t = t.replace(/\bapplySchema\b/gi, '')
  t = t.replace(/\bexecuteProductionLaunchJob\b/gi, '')
  t = t.replace(/\bPocketBase\b/gi, '')
  t = t.replace(/\bCommerce ABI\b/gi, '')
  t = t.replace(/\bprojectRef\b/gi, '')
  t = t.replace(/\bjobId\b/gi, '')
  t = t.replace(/\bplj_[a-z0-9_-]+\b/gi, '')
  t = t.replace(/\boperationId\b/gi, '')
  t = t.replace(/please call (?:the )?(?:tool|launch).*/gi, 'I will finish this for you.')
  t = t.replace(/\s{2,}/g, ' ').trim()
  return t
}

export type ExecutionHint = {
  turnClass?: string | null
  planStatus?: string | null
  stepStatuses?: Array<{ id: string; status: string }> | null
  jobStatus?: string | null
  jobStage?: string | null
  guest?: boolean
  failureCode?: string | null
  failureMessage?: string | null
  repairable?: boolean
}

/** Reconstruct stream/execution from persisted ExecutionPlan + job store — not request RAM. */
export function executionHintFromPersistedPlan(
  plan: {
    turnClass?: string | null
    status?: string | null
    steps?: Array<{ stepId?: string; command?: string; status?: string }>
  } | null,
  job?: {
    status?: string | null
    stages?: Array<{ id?: string; status?: string }>
    failures?: Array<{ code?: string; message?: string; repairable?: boolean }>
  } | null,
): ExecutionHint {
  const runningStage = job?.stages?.find((s) => s.status === 'running' || s.status === 'pending')
  const lastFail = job?.failures?.at(-1)
  return {
    turnClass: plan?.turnClass || null,
    planStatus: plan?.status || null,
    stepStatuses: (plan?.steps || []).map((s) => ({
      id: s.stepId || s.command || '',
      status: s.status || 'pending',
    })),
    jobStatus: job?.status || null,
    jobStage: runningStage?.id || null,
    failureCode: job?.status === 'blocked' ? lastFail?.code || null : null,
    failureMessage: job?.status === 'blocked' ? lastFail?.message || null : null,
    repairable: lastFail?.repairable,
  }
}

function kindOf(state: RuntimeView): BusinessAppKind {
  return appTypeToKind(state.spec?.businessType || state.business.kind)
}

function typeLabel(kind: BusinessAppKind): string {
  if (isAppJourneyKind(kind)) return 'SaaS'
  if (isWebsiteJourneyKind(kind)) return 'Website'
  return 'Store'
}

export function lifecycleFromRuntime(state: RuntimeView, hint: ExecutionHint = {}): LifecycleStageId {
  if (hint.guest) return 'BUILD'
  const live = state.live.isLive && Boolean(state.live.url)
  const operating =
    live &&
    (state.events.some((e) => /operate|catalog|order/i.test(e.kind)) ||
      state.commerce.orderCount > 0 ||
      hint.turnClass === 'operate')
  if (operating) return 'OPERATING'
  if (live || hint.jobStatus === 'live') return 'LIVE'
  if (hint.jobStatus === 'running' && /deploy|smoke|live/i.test(hint.jobStage || '')) return 'READY'
  if (state.health.catalogReady && state.preview.status === 'ready') return 'READY'
  if (state.preview.status === 'ready' && state.preview.url) return 'PREVIEW'
  return 'BUILD'
}

export function lifecycleRail(current: LifecycleStageId): PresentationSurface['lifecycle'] {
  const order = LIFECYCLE_STAGES
  const idx = order.indexOf(current)
  return {
    current,
    stages: order.map((id, i) => ({
      id,
      label: id === 'BUILD' ? 'Build' : id === 'PREVIEW' ? 'Preview' : id === 'READY' ? 'Ready' : id === 'LIVE' ? 'Live' : 'Operating',
      status: i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
    })),
  }
}

export function streamPhaseFromHint(state: RuntimeView, hint: ExecutionHint = {}): { phase: StreamPhase; label: string } {
  const noun = businessNoun(kindOf(state))
  if (hint.guest) return { phase: 'IDLE', label: 'Create an account to continue' }
  if (
    hint.planStatus === 'failed' ||
    hint.planStatus === 'interrupted' ||
    hint.jobStatus === 'blocked' ||
    state.preview.status === 'error'
  ) {
    return { phase: 'BLOCKED', label: 'Needs a fix before we continue' }
  }
  const steps = hint.stepStatuses || []
  const running = steps.find((s) => s.status === 'running')
  const pending = steps.some((s) => s.status === 'pending' || s.status === 'running')
  const publishing =
    (hint.jobStatus === 'running' || hint.jobStatus === 'queued') &&
    (hint.turnClass === 'launch' || /deploy|smoke|live|publish/i.test(hint.jobStage || ''))
  if (publishing) {
    return { phase: 'EXECUTING', label: `Publishing your ${noun}` }
  }
  const previewReady = state.preview.status === 'ready' && Boolean(state.preview.url)
  if (hint.planStatus === 'succeeded' && previewReady) {
    return { phase: 'COMPLETED', label: state.live.isLive ? `Your ${noun} is live` : 'Preview is ready' }
  }
  if (running && /verify|smoke|check/i.test(running.id)) {
    return { phase: 'VERIFYING', label: `Checking your ${noun}` }
  }
  if (hint.jobStage && /verify|smoke/i.test(hint.jobStage) && hint.jobStatus === 'running') {
    return { phase: 'VERIFYING', label: `Checking your ${noun}` }
  }
  if (running || hint.planStatus === 'running') {
    if (hint.turnClass === 'launch' || /deploy|live/i.test(hint.jobStage || '')) {
      return { phase: 'EXECUTING', label: `Publishing your ${noun}` }
    }
    return { phase: 'EXECUTING', label: `Building your ${noun}` }
  }
  if (pending && hint.planStatus === 'pending') {
    return { phase: 'THINKING', label: 'Understanding what you asked for' }
  }
  if (state.live.isLive || (previewReady && !pending)) {
    return { phase: 'COMPLETED', label: state.live.isLive ? `Your ${noun} is live` : 'Preview is ready' }
  }
  if (!state.spec) return { phase: 'IDLE', label: 'Tell me what to build' }
  return { phase: 'THINKING', label: 'Preparing your preview' }
}

export function executionCardFromState(
  state: RuntimeView,
  hint: ExecutionHint = {},
): PresentationSurface['executionCard'] {
  const noun = businessNoun(kindOf(state))
  const named = (state.business.name || state.spec?.businessName || '').trim()
  const who = named || `your ${noun}`
  const steps = hint.stepStatuses || []
  const fromStep = steps.some((s) => s.status === 'running' || s.status === 'succeeded' || s.status === 'failed')
  if (hint.jobStatus === 'blocked' || hint.planStatus === 'failed') {
    const fail = humanizeLaunchFailure({
      code: hint.failureCode,
      message: hint.failureMessage,
      repairable: hint.repairable,
    })
    return { kind: 'blocked', title: fail.title, body: fail.body, fromStep }
  }
  if (state.live.isLive && state.live.url) {
    return { kind: 'live', title: `${who} is live`, body: 'Customers can reach it on Indobase.', fromStep: true }
  }
  if (hint.turnClass === 'launch' || hint.jobStatus === 'running' && /deploy|smoke|live/i.test(hint.jobStage || '')) {
    return { kind: 'publishing', title: `Publishing ${who}`, body: 'Final checks, then your live link.', fromStep }
  }
  if (hint.turnClass === 'modify' && steps.some((s) => s.status === 'succeeded')) {
    return { kind: 'updated', title: 'Updated', body: 'The preview reflects your change.', fromStep: true }
  }
  if (state.preview.status === 'ready') {
    return { kind: 'updated', title: 'Preview ready', body: 'Review it, then publish when you are ready.', fromStep }
  }
  if (hint.turnClass === 'build' || hint.jobStatus === 'running' || state.preview.status === 'building') {
    return { kind: 'building', title: `Building ${who}`, body: 'Watch the preview fill in as we go.', fromStep }
  }
  return null
}

export function contextualActionsFor(state: RuntimeView, hint: ExecutionHint = {}): UxAction[] {
  const kind = kindOf(state)
  const noun = businessNoun(kind)
  if (hint.guest) {
    return [
      {
        label: 'Create account',
        message: 'Create my Indobase account so I can launch (name, email, and privacy consent).',
      },
    ]
  }
  if (hint.jobStatus === 'blocked' || hint.planStatus === 'failed') {
    return humanizeLaunchFailure({
      code: hint.failureCode,
      message: hint.failureMessage,
      repairable: hint.repairable,
    }).actions
  }
  const live = state.live.isLive && Boolean(state.live.url)
  if (live) {
    const actions: UxAction[] = [
      { label: `Open ${noun}`, message: `Open my live ${noun}${state.live.url ? ` ${state.live.url}` : '.'}` },
    ]
    if (isStoreJourneyKind(kind)) {
      actions.push({ label: 'Manage products', message: 'Show my products and help me add or update them.' })
      actions.push({ label: 'View orders', message: "Show me today's orders." })
      if (!state.health.paymentsReady) {
        actions.splice(1, 0, {
          label: 'Connect payments',
          message: 'Connect payments so customers can pay online.',
        })
      }
    } else if (isAppJourneyKind(kind)) {
      actions.push({ label: 'Manage users', message: 'Show me customer accounts for this app.' })
    } else {
      actions.push({ label: 'Connect a domain', message: 'Connect a domain I already own.' })
    }
    return actions.slice(0, 3)
  }
  if (state.preview.status === 'ready') {
    return [
      { label: 'Preview', message: 'Open the preview so I can review it.' },
      { label: 'Publish', message: `Launch my ${noun} on Indobase now.` },
    ]
  }
  return [{ label: 'Start building', message: 'Start building my business from what I described. Infer the rest.' }]
}

function money(minor?: number, currency = 'INR'): string {
  if (typeof minor !== 'number' || Number.isNaN(minor)) return '—'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${Math.round(minor / 100)} ${currency}`
  }
}

const INTERNAL_ID = /^(plj_|job_|op_|pb_|executeProduction)/i

export function customerSafeOrderDisplayId(order: { id?: string; orderNumber?: string }): string {
  const number = (order.orderNumber || '').trim()
  if (number && !INTERNAL_ID.test(number) && number !== order.id) {
    return `#${number.replace(/^#/, '')}`
  }
  const raw = (order.id || number || '').replace(/^(ord_|order_)/i, '')
  if (!raw || INTERNAL_ID.test(raw)) return 'Order'
  if (raw.length <= 8) return `#${raw}`
  return `#${raw.slice(-6).toUpperCase()}`
}

function displayPriceMinor(product: NonNullable<RuntimeView['products']>[number]): number | undefined {
  const prices = (product.variants || [])
    .map((v) => v.priceMinor)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (prices.length) return Math.min(...prices)
  return typeof product.priceMinor === 'number' && Number.isFinite(product.priceMinor)
    ? product.priceMinor
    : undefined
}

export function overviewListsFromRuntime(
  state: RuntimeView,
  limit = CONTROL_CENTER_LIST_LIMIT,
): { products: PresentationProductRow[]; orders: PresentationOrderRow[] } {
  const kind = kindOf(state)
  if (!isStoreJourneyKind(kind)) return { products: [], orders: [] }
  const currency = state.spec?.currency || 'INR'
  const products = (state.products || []).slice(0, limit).map((p) => {
    const stock =
      typeof p.stock === 'number'
        ? p.stock
        : (p.variants || []).some((v) => typeof v.stock === 'number')
          ? (p.variants || []).reduce((n, v) => n + (typeof v.stock === 'number' ? v.stock : 0), 0)
          : undefined
    const price = displayPriceMinor(p)
    return {
      name: (p.name || p.id || 'Product').trim(),
      variantCount: p.variants?.length || 1,
      price: typeof price === 'number' ? money(price, currency) : '—',
      stock,
    }
  })
  const orders = (state.orders || []).slice(0, limit).map((o) => ({
    id: customerSafeOrderDisplayId(o),
    status: (o.paymentStatus || o.status || 'pending').replace(/_/g, ' '),
    amount: typeof o.amountMinor === 'number' ? money(o.amountMinor, currency) : '—',
    createdAt: o.createdAt || null,
  }))
  return { products, orders }
}

export function homeFromRuntime(state: RuntimeView, hint: ExecutionHint = {}): PresentationSurface['home'] {
  const kind = kindOf(state)
  const name = (state.business.name || state.spec?.businessName || '').trim() || 'Your business'
  const loading =
    hint.planStatus === 'running' ||
    hint.jobStatus === 'running' ||
    hint.jobStatus === 'queued' ||
    state.preview.status === 'building'
  const empty = !state.spec && state.preview.status === 'absent' && !state.live.isLive
  const error =
    hint.jobStatus === 'blocked' || hint.planStatus === 'failed'
      ? humanizeLaunchFailure({
          code: hint.failureCode,
          message: hint.failureMessage,
          repairable: hint.repairable,
        }).body
      : state.preview.status === 'error'
        ? 'Preview did not come up. I can retry.'
        : null
  const metrics: PresentationMetric[] = []
  if (isStoreJourneyKind(kind)) {
    metrics.push({ id: 'products', label: 'Products', value: String(state.catalog.productCount) })
    metrics.push({ id: 'orders', label: 'Orders', value: String(state.commerce.orderCount) })
    const todayCount = state.commerce.todayOrderCount ?? 0
    metrics.push({ id: 'today-orders', label: "Today's orders", value: String(todayCount) })
    if (typeof state.commerce.todayRevenueMinor === 'number') {
      metrics.push({
        id: 'today-revenue',
        label: "Today's revenue",
        value: money(state.commerce.todayRevenueMinor, state.spec?.currency),
      })
    }
  } else if (isAppJourneyKind(kind)) {
    metrics.push({ id: 'users', label: 'Users', value: String((state.customers || []).length) })
    metrics.push({ id: 'data', label: 'Records', value: state.health.catalogReady ? 'Ready' : 'Preparing' })
  } else {
    metrics.push({ id: 'site', label: 'Website', value: state.live.isLive ? 'Live' : state.preview.status === 'ready' ? 'Preview' : 'Building' })
  }
  const checkoutStatus = isStoreJourneyKind(kind)
    ? state.health.catalogReady
      ? 'Checkout is ready'
      : 'Checkout is being prepared'
    : null
  const paymentsStatus = isStoreJourneyKind(kind)
    ? state.health.paymentsReady
      ? 'Payments connected'
      : state.live.isLive
        ? 'Payments not connected yet'
        : null
    : isWebsiteJourneyKind(kind)
      ? null
      : state.health.paymentsReady
        ? 'Payments connected'
        : null
  return {
    name,
    typeLabel: typeLabel(kind),
    kind,
    metrics,
    checkoutStatus,
    paymentsStatus,
    previewUrl: state.preview.url,
    liveUrl: state.live.url,
    empty,
    loading: Boolean(loading && !empty),
    error,
    ...overviewListsFromRuntime(state),
  }
}

export function composePresentation(state: RuntimeView, hint: ExecutionHint = {}): PresentationSurface {
  const kind = kindOf(state)
  const capabilities = projectCapabilities({
    appType: state.spec?.businessType || state.business.kind,
    kind,
    backendReady: state.health.catalogReady,
    paymentsReady: state.health.paymentsReady,
  })
  const nav = controlCenterNav(kind, capabilities)
  const current = lifecycleFromRuntime(state, hint)
  const noun = businessNoun(kind)
  const named = (state.business.name || state.spec?.businessName || '').trim()
  const failure =
    hint.jobStatus === 'blocked' || hint.planStatus === 'failed'
      ? humanizeLaunchFailure({
          code: hint.failureCode,
          message: hint.failureMessage,
          repairable: hint.repairable,
        })
      : null
  const live = state.live.isLive && Boolean(state.live.url)
  let headline = named ? `${named}` : `Your ${noun}`
  let body = 'Tell me what to change.'
  let liveBanner: string | null = null
  if (failure) {
    headline = failure.title
    body = failure.body
  } else if (live) {
    headline = named ? `${named} is live` : `Your ${noun} is live`
    const orderBit =
      isStoreJourneyKind(kind) && state.commerce.orderCount > 0
        ? ` ${state.commerce.orderCount} order${state.commerce.orderCount === 1 ? '' : 's'} so far.`
        : ''
    body = `Customers can visit it on Indobase.${orderBit}`
    liveBanner = 'Your business is live'
  } else if (state.preview.status === 'ready') {
    headline = named ? `${named} is ready to review` : `Your ${noun} is ready to review`
    body = 'Preview it, then publish when it looks right.'
  } else if (hint.planStatus === 'running' || hint.jobStatus === 'running') {
    headline = `Building ${named || `your ${noun}`}`
    body = 'Progress comes from the work in progress — not a checklist.'
  } else if (!state.spec) {
    headline = 'What do you want to launch?'
    body = 'Tell me the business. I will build a preview, then you publish.'
  }
  return {
    lifecycle: lifecycleRail(current),
    stream: streamPhaseFromHint(state, hint),
    executionCard: executionCardFromState(state, hint),
    home: homeFromRuntime(state, hint),
    actions: contextualActionsFor(state, hint),
    control: {
      show: live,
      nav,
      capabilities,
      ...overviewListsFromRuntime(state),
    },
    copy: { headline, body, liveBanner },
    failure,
  }
}

export function assertCapabilityFitsKind(kind: BusinessAppKind, nav: ControlCenterSection[]): string[] {
  const ids = nav.map((n) => n.id)
  const leaks: string[] = []
  if (isAppJourneyKind(kind) && ids.includes('storefront') && ids.includes('products')) {
    leaks.push('saas-store-products')
  }
  if (isAppJourneyKind(kind) && ids.includes('products')) leaks.push('saas-products')
  if (isAppJourneyKind(kind) && ids.includes('orders')) leaks.push('saas-orders')
  if (isWebsiteJourneyKind(kind) && (ids.includes('products') || ids.includes('orders') || ids.includes('payments'))) {
    leaks.push('landing-commerce')
  }
  if (isStoreJourneyKind(kind) && ids.includes('website') && !ids.includes('products')) {
    leaks.push('store-missing-products')
  }
  return leaks
}
