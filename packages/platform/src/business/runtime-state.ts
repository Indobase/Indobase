/**
 * BusinessRuntimeState — one truth per agent turn (ADR 0008).
 *
 * Chat, preview, Control Center, launch, and operate must project this object.
 * Competing truths (CC has an order, agent says DB unavailable) are a product bug.
 */

import type {
  BusinessCustomer,
  BusinessOrder,
  BusinessProduct,
} from './data'

export type BusinessRuntimeIdentity = {
  signedIn: boolean
  email: string | null
  displayName: string | null
}

export type BusinessRuntimeBusiness = {
  ref: string
  name: string
  kind: string
  state: string
}

export type BusinessRuntimeWorkspace = {
  ref: string
  slug: string
}

export type BusinessRuntimeSpec = {
  businessName: string
  businessType: string
  industry?: string
  category?: string
  verticalId?: string
  visualStyle?: string
  currency?: string
} | null

export type BusinessRuntimePreview = {
  status: 'absent' | 'building' | 'ready' | 'error' | (string & {})
  url: string | null
}

export type BusinessRuntimeDeployment = {
  status: string | null
  jobId: string | null
}

export type BusinessRuntimeLive = {
  isLive: boolean
  url: string | null
}

export type BusinessRuntimeCapability = {
  id: string
  enabled: boolean
  /** requested → planned → executing → ready → failed. Only ready may be narrated as done. */
  status?: 'requested' | 'planned' | 'executing' | 'ready' | 'failed'
  label?: string
}

export type BusinessRuntimeEvent = {
  at: string
  kind: string
  message: string
  commandId?: string
}

export type BusinessRuntimeJob = {
  id: string
  status: string
}

export type BusinessRuntimeHealth = {
  catalogReady: boolean
  paymentsReady: boolean
  previewReady: boolean
}

export type BusinessRuntimeState = {
  identity: BusinessRuntimeIdentity
  business: BusinessRuntimeBusiness
  workspace: BusinessRuntimeWorkspace
  spec: BusinessRuntimeSpec
  preview: BusinessRuntimePreview
  deployment: BusinessRuntimeDeployment
  live: BusinessRuntimeLive
  products: BusinessProduct[]
  customers: BusinessCustomer[]
  orders: BusinessOrder[]
  capabilities: BusinessRuntimeCapability[]
  jobs: BusinessRuntimeJob[]
  health: BusinessRuntimeHealth
  events: BusinessRuntimeEvent[]
}

export type AgentRuntimeClaim =
  | 'preview'
  | 'live'
  | 'orders-unavailable'
  | 'products-unavailable'
  | 'catalog-unavailable'
  | 'customers-unavailable'

export function emptyBusinessRuntimeState(
  overrides: Partial<BusinessRuntimeState> = {},
): BusinessRuntimeState {
  return {
    identity: {
      signedIn: false,
      email: null,
      displayName: null,
      ...overrides.identity,
    },
    business: {
      ref: '',
      name: '',
      kind: 'unknown',
      state: 'empty',
      ...overrides.business,
    },
    workspace: { ref: '', slug: '', ...overrides.workspace },
    spec: overrides.spec === undefined ? null : overrides.spec,
    preview: { status: 'absent', url: null, ...overrides.preview },
    deployment: { status: null, jobId: null, ...overrides.deployment },
    live: { isLive: false, url: null, ...overrides.live },
    products: overrides.products ?? [],
    customers: overrides.customers ?? [],
    orders: overrides.orders ?? [],
    capabilities: overrides.capabilities ?? [],
    jobs: overrides.jobs ?? [],
    events: overrides.events ?? [],
    health: {
      catalogReady: false,
      paymentsReady: false,
      previewReady: false,
      ...overrides.health,
    },
  }
}

export function agentMayClaimPreview(state: BusinessRuntimeState): boolean {
  return state.preview.status === 'ready' && Boolean(state.preview.url)
}

export function agentMayClaimLive(state: BusinessRuntimeState): boolean {
  return (
    state.live.isLive &&
    Boolean(state.live.url) &&
    (state.business.state === 'live' || state.live.isLive)
  )
}

/** True when the agent must NOT invent “connection unavailable” for this entity. */
export function entityListedInRuntime(
  state: BusinessRuntimeState,
  kind: 'orders' | 'products' | 'customers' | 'catalog',
): boolean {
  if (kind === 'orders') return state.orders.length > 0
  if (kind === 'products') return state.products.length > 0
  if (kind === 'customers') return state.customers.length > 0
  return state.health.catalogReady || state.products.length > 0
}

export function isForbiddenAgentClaim(
  state: BusinessRuntimeState,
  claim: AgentRuntimeClaim,
): boolean {
  switch (claim) {
    case 'preview':
      return !agentMayClaimPreview(state)
    case 'live':
      return !agentMayClaimLive(state)
    case 'orders-unavailable':
      return entityListedInRuntime(state, 'orders')
    case 'products-unavailable':
      return entityListedInRuntime(state, 'products')
    case 'catalog-unavailable':
      return entityListedInRuntime(state, 'catalog')
    case 'customers-unavailable':
      return entityListedInRuntime(state, 'customers')
  }
}

export function composeBusinessRuntimeStateHint(state: BusinessRuntimeState): string {
  const productLines = state.products
    .slice(0, 8)
    .map((p) => `- ${p.name || p.id}`)
  const orderLines = state.orders.slice(0, 8).map((o) => {
    const id = o.orderNumber || o.id || '?'
    const status = o.paymentStatus || o.status || ''
    return `- #${id} ${status}`.trim()
  })
  const customerLines = state.customers
    .slice(0, 8)
    .map((c) => `- ${c.email || c.name || c.id}`)
  const capLines = state.capabilities
    .filter((c) => c.enabled)
    .map((c) => c.label || c.id)
  const jobLines = state.jobs
    .slice(0, 4)
    .map((j) => `${j.id}:${j.status}`)

  const lines = [
    '## BusinessRuntimeState (HARD — speak only from this)',
    `identity.signedIn: ${state.identity.signedIn ? 'yes' : 'no'}`,
    `identity.email: ${state.identity.email || 'none'}`,
    `business.ref: ${state.business.ref || 'none'}`,
    `business.name: ${state.business.name || 'none'}`,
    `business.kind: ${state.business.kind}`,
    `business.state: ${state.business.state}`,
    `workspace.ref: ${state.workspace.ref || 'none'}`,
    `preview.status: ${state.preview.status}`,
    `preview.url: ${state.preview.url || 'none'}`,
    `deployment.status: ${state.deployment.status || 'none'}`,
    `deployment.jobId: ${state.deployment.jobId || 'none'}`,
    `live.isLive: ${state.live.isLive ? 'yes' : 'no'}`,
    `live.url: ${state.live.url || 'none'}`,
    `health.catalogReady: ${state.health.catalogReady ? 'yes' : 'no'}`,
    `health.paymentsReady: ${state.health.paymentsReady ? 'yes' : 'no'}`,
    `health.previewReady: ${state.health.previewReady ? 'yes' : 'no'}`,
  ]
  if (state.spec) {
    const spec = state.spec
    lines.push(
      `business.spec: ${spec.businessName} / ${spec.businessType} / ${spec.category || spec.industry || ''} / ${spec.verticalId || ''} / ${spec.visualStyle || ''} / ${spec.currency || ''}`.trim(),
    )
    lines.push(
      'Honor BusinessSpec. Do not substitute a generic apparel catalog when the spec is sneakers (or any other niche).',
    )
  } else {
    lines.push('business.spec: none')
  }
  if (capLines.length) {
    lines.push(`capabilities.enabled: ${capLines.join(', ')}`)
  }
  const capStatus = state.capabilities
    .map((c) => `${c.id}:${c.status || (c.enabled ? 'ready' : 'absent')}`)
    .slice(0, 8)
  if (capStatus.length) {
    lines.push(`capabilities.status: ${capStatus.join(', ')}`)
  }
  if (jobLines.length) {
    lines.push(`jobs: ${jobLines.join(', ')}`)
  }
  const eventLines = state.events.slice(-6).map((e) => `- ${e.kind}: ${e.message}`)
  if (eventLines.length) {
    lines.push('recent execution events:')
    lines.push(...eventLines)
  }
  if (productLines.length) {
    lines.push('products (from BusinessRuntimeState):')
    lines.push(...productLines)
  }
  if (customerLines.length) {
    lines.push('customers (from BusinessRuntimeState):')
    lines.push(...customerLines)
  }
  if (orderLines.length) {
    lines.push('orders (from BusinessRuntimeState):')
    lines.push(...orderLines)
  }
  lines.push(
    [
      'Rules:',
      '- Answer “show latest order” / SCREEN show-order from BusinessRuntimeState.orders only. If an order id is listed, describe it.',
      '- Never invent “connection unavailable” when this object lists the entity.',
      '- Never describe a preview as available unless preview.status is ready and preview.url is set.',
      '- Never claim LIVE unless live.isLive is yes and live.url is set.',
      '- Never claim a capability ready unless capabilities.status is ready. “Customer database enabled” is forbidden until then.',
      '- COMPLETED claims require a command result plus this object. Chat history is not authoritative.',
      '- Launch / Go Live is a launch command (launchProductionApp / business.launch). Do not ask the operator to refresh.',
      '- After sign-in: continue the original request immediately. Do not ask them to wait or refresh Indobase.',
      '- Customer language: Business / Workspace / Live. Never say Studio, PocketBase, tenant, provisioner, or “backend ready”.',
      '- If a tool fails, quote the humanized failure and offer Fix it automatically. Never invent “service unavailable”.',
    ].join('\n'),
  )
  return lines.join('\n')
}
