/**
 * Execution integrity — COMPLETED claims require authoritative state.
 * Prompts are not a substitute. Chat history is not a store.
 */

import {
  agentMayClaimLive,
  agentMayClaimPreview,
  type BusinessRuntimeState,
} from './runtime-state'

export type CapabilityPhase = 'requested' | 'planned' | 'executing' | 'ready' | 'failed'

export const CAPABILITY_PHASES: readonly CapabilityPhase[] = [
  'requested',
  'planned',
  'executing',
  'ready',
  'failed',
] as const

export function capabilityMayClaimReady(phase: CapabilityPhase | undefined | null): boolean {
  return phase === 'ready'
}

export type FabricatedClaim =
  | 'preview'
  | 'live'
  | 'capability'
  | 'orders'
  | 'products'
  | 'catalog'
  | 'orders-unavailable'
  | 'store-missing'
  | 'command-unavailable'

const PREVIEW_READY_SPEECH =
  /\b(preview is ready|your (?:store|shop|site|app) is ready|everything is ready|storefront is (?:ready|live)|you can (?:view|browse|preview) (?:it|your store))\b/i

const LIVE_SPEECH =
  /\b(is (?:now )?live|now live at|your (?:store|shop|site) is live|go live succeeded|published at)\b/i

const DATABASE_SPEECH =
  /\b(customer database (?:enabled|created|ready|is on)|database (?:is |was )?(?:enabled|ready|connected)|backend ready|pocketbase)\b/i

const ORDERS_SPEECH =
  /\b(orders? (?:are|is) (?:available|ready|connected)|you (?:already )?have orders)\b/i

const PRODUCTS_SPEECH =
  /\b(catalog is ready|products are (?:live|ready|in the database))\b/i

const ORDERS_UNAVAILABLE_SPEECH =
  /\b(?:commerce admin|admin service).{0,80}(?:isn['’]?t|is not|not) available|no order data (?:was )?returned|orders? (?:are|is|connection|data).{0,40}(?:unavailable|not (?:available|connected|returned))|(?:the )?(?:database|backend) isn['’]?t (?:connected|available)\b/i

const STORE_MISSING_SPEECH =
  /\b(?:not in this workspace|isn['’]?t currently available|(?:store|shop|site) (?:is )?(?:not|isn['’]?t) (?:in this workspace|currently available))\b/i

const COMMAND_UNAVAILABLE_SPEECH =
  /\b(?:(?:launch|preview|persisted-preview|editing) command|launchProductionApp|launchBusiness)\b.{0,40}isn['’]?t (?:currently )?available|\bcommand isn['’]?t (?:currently )?available\b/i

export function detectFabricatedClaims(
  text: string,
  state: BusinessRuntimeState,
): FabricatedClaim[] {
  const hits: FabricatedClaim[] = []
  const body = text || ''
  if (!agentMayClaimPreview(state) && PREVIEW_READY_SPEECH.test(body)) hits.push('preview')
  if (!agentMayClaimLive(state) && LIVE_SPEECH.test(body)) hits.push('live')
  const dataReady = state.capabilities.some(
    (c) =>
      (c.id === 'businessData' || c.id === 'database' || /data|database/i.test(c.label || '')) &&
      (c.status === 'ready' || (c.enabled && !c.status)),
  )
  if (!dataReady && DATABASE_SPEECH.test(body)) hits.push('capability')
  if (state.orders.length === 0 && ORDERS_SPEECH.test(body)) hits.push('orders')
  if (state.orders.length > 0 && ORDERS_UNAVAILABLE_SPEECH.test(body)) hits.push('orders-unavailable')
  if (state.products.length === 0 && !state.health.catalogReady && PRODUCTS_SPEECH.test(body)) {
    hits.push('products')
  }
  if (agentMayClaimPreview(state) && STORE_MISSING_SPEECH.test(body)) hits.push('store-missing')
  const toolsExist = Boolean(
    state.preview.status === 'ready' ||
      state.live.isLive ||
      state.deployment.jobId ||
      state.jobs.length > 0,
  )
  if (toolsExist && COMMAND_UNAVAILABLE_SPEECH.test(body)) hits.push('command-unavailable')
  return hits
}

export function completedClaimAllowed(
  state: BusinessRuntimeState,
  claim: FabricatedClaim,
): boolean {
  switch (claim) {
    case 'preview':
      return agentMayClaimPreview(state)
    case 'live':
      return agentMayClaimLive(state)
    case 'capability':
      return state.capabilities.some((c) => c.status === 'ready' || c.enabled)
    case 'orders':
      return state.orders.length > 0
    case 'orders-unavailable':
      return state.orders.length === 0
    case 'store-missing':
      return !agentMayClaimPreview(state)
    case 'command-unavailable':
      return !(
        state.preview.status === 'ready' ||
        state.live.isLive ||
        state.deployment.jobId ||
        state.jobs.length > 0
      )
    case 'products':
    case 'catalog':
      return state.health.catalogReady || state.products.length > 0
  }
}

const PREPARING =
  'Your store is still preparing. I will show the preview as soon as it is ready — nothing is live yet.'
const NOT_LIVE =
  'Your store is not live yet. I will launch it when you ask, and only confirm the live link after it responds.'
const NO_DATABASE =
  'Customer data is not enabled yet. I will not claim it is ready until the business runtime says so.'
const NO_ORDERS = 'I do not have any orders in BusinessRuntimeState yet.'
const NO_PRODUCTS = 'The catalog is not ready in BusinessRuntimeState yet.'

function describeListedOrders(state: BusinessRuntimeState): string {
  return state.orders
    .slice(0, 3)
    .map((o) => {
      const id = o.orderNumber || o.id
      const who = o.customerName || o.email || ''
      const amt =
        typeof o.amountMinor === 'number' && Number.isFinite(o.amountMinor)
          ? String(Math.round(o.amountMinor / 100))
          : ''
      const items = o.itemsSummary || ''
      return `#${id}${who ? ` ${who}` : ''}${amt ? ` ${amt}` : ''}${items ? ` ${items}` : ''}`.trim()
    })
    .join('; ')
}

function replaceAll(source: string, pattern: RegExp, replacement: string): string {
  return source.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), replacement)
}

/**
 * Rewrite fabricated success speech. Never invent preview/live/database/orders.
 */
export function sanitizeAgentNarration(text: string, state: BusinessRuntimeState): string {
  const hits = detectFabricatedClaims(text, state)
  if (hits.length === 0) return text
  let out = text
  if (hits.includes('preview')) out = replaceAll(out, PREVIEW_READY_SPEECH, PREPARING)
  if (hits.includes('live')) out = replaceAll(out, LIVE_SPEECH, NOT_LIVE)
  if (hits.includes('capability')) out = replaceAll(out, DATABASE_SPEECH, NO_DATABASE)
  if (hits.includes('orders')) out = replaceAll(out, ORDERS_SPEECH, NO_ORDERS)
  if (hits.includes('orders-unavailable')) {
    const listed = describeListedOrders(state)
    out = replaceAll(
      out,
      ORDERS_UNAVAILABLE_SPEECH,
      listed ? `order ${listed} is listed in BusinessRuntimeState` : NO_ORDERS,
    )
  }
  if (hits.includes('store-missing')) {
    const url = state.preview.url || state.live.url || 'this workspace'
    out = replaceAll(out, STORE_MISSING_SPEECH, `the store is in this workspace (${url})`)
  }
  if (hits.includes('command-unavailable')) {
    out = replaceAll(
      out,
      COMMAND_UNAVAILABLE_SPEECH,
      'the existing launch and preview path is already running for this workspace',
    )
  }
  if (hits.includes('products')) out = replaceAll(out, PRODUCTS_SPEECH, NO_PRODUCTS)
  const remaining = detectFabricatedClaims(out, state)
  if (remaining.length === 0) return out
  if (!remaining.some((h) => h === 'preview' || h === 'live' || h === 'capability')) return out
  return [PREPARING, hits.includes('capability') ? NO_DATABASE : '', hits.includes('live') ? NOT_LIVE : '']
    .filter(Boolean)
    .join(' ')
}
