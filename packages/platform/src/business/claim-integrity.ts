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
  if (state.products.length === 0 && !state.health.catalogReady && PRODUCTS_SPEECH.test(body)) {
    hits.push('products')
  }
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

/**
 * Rewrite fabricated success speech. Never invent preview/live/database/orders.
 */
export function sanitizeAgentNarration(text: string, state: BusinessRuntimeState): string {
  const hits = detectFabricatedClaims(text, state)
  if (hits.length === 0) return text
  let out = text
  if (hits.includes('preview')) out = out.replace(PREVIEW_READY_SPEECH, PREPARING)
  if (hits.includes('live')) out = out.replace(LIVE_SPEECH, NOT_LIVE)
  if (hits.includes('capability')) out = out.replace(DATABASE_SPEECH, NO_DATABASE)
  if (hits.includes('orders')) out = out.replace(ORDERS_SPEECH, NO_ORDERS)
  if (hits.includes('products')) out = out.replace(PRODUCTS_SPEECH, NO_PRODUCTS)
  if (detectFabricatedClaims(out, state).length === 0) return out
  return [PREPARING, hits.includes('capability') ? NO_DATABASE : '', hits.includes('live') ? NOT_LIVE : '']
    .filter(Boolean)
    .join(' ')
}
