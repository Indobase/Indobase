/**
 * Authoritative state the agent must speak from.
 * UI, Control Center, and chat consume BusinessRuntimeState — never two truths.
 */

import {
  agentMayClaimLive as runtimeMayClaimLive,
  agentMayClaimPreview as runtimeMayClaimPreview,
  composeBusinessRuntimeStateHint,
  emptyBusinessRuntimeState,
  isForbiddenAgentClaim,
  type BusinessRuntimeState,
} from '@indobase/platform'

import type { BusinessSpec } from './business-spec.js'
import type { PreviewStatus } from './preview-gate.js'

export type { BusinessRuntimeState }
export { isForbiddenAgentClaim }

export type BusinessSnapshotSummary = {
  products: Array<{ id?: string; name?: string; priceMinor?: number; slug?: string; stock?: number }>
  orders: Array<{
    id?: string
    orderNumber?: string
    status?: string
    payment_status?: string
    fulfillment_status?: string
    amount_minor?: number
    email?: string
    customer_name?: string
    items?: string
  }>
  customers?: Array<{ id?: string; email?: string; name?: string }>
}

export type AuthoritativeTruth = {
  projectState: string
  previewStatus: PreviewStatus
  previewUrl: string | null
  liveUrl: string | null
  catalogReady: boolean
  spec?: BusinessSpec | null
  snapshot?: BusinessSnapshotSummary | null
  identity?: BusinessRuntimeState['identity']
  business?: Partial<BusinessRuntimeState['business']>
  workspace?: Partial<BusinessRuntimeState['workspace']>
  deployment?: Partial<BusinessRuntimeState['deployment']>
  capabilities?: BusinessRuntimeState['capabilities']
  jobs?: BusinessRuntimeState['jobs']
  events?: BusinessRuntimeState['events']
  paymentsReady?: boolean
}

export function toBusinessRuntimeState(truth: AuthoritativeTruth): BusinessRuntimeState {
  const snap = truth.snapshot
  const live = Boolean(truth.liveUrl) && truth.projectState === 'live'
  const products = (snap?.products || [])
    .filter((p) => p.id || p.name)
    .map((p) => ({
      id: p.id || p.name || '',
      name: p.name || p.id || '',
      priceMinor: p.priceMinor,
      stock: typeof p.stock === 'number' ? p.stock : undefined,
    }))
  const orders = (snap?.orders || [])
    .filter((o) => o.id || o.orderNumber)
    .map((o) => ({
      id: o.id || o.orderNumber || '',
      orderNumber: o.orderNumber || o.id,
      status: o.status,
      paymentStatus: o.payment_status,
      fulfillmentStatus: o.fulfillment_status,
      amountMinor: o.amount_minor,
      email: o.email,
      customerName: o.customer_name,
      itemsSummary: o.items,
    }))
  const customers = (snap?.customers || [])
    .filter((c) => c.id || c.email)
    .map((c) => ({
      id: c.id || c.email || '',
      email: c.email,
      name: c.name,
    }))
  const state = emptyBusinessRuntimeState({
    identity: truth.identity,
    business: {
      ref: truth.business?.ref || truth.workspace?.ref || '',
      name: truth.business?.name || truth.spec?.businessName || '',
      kind: truth.business?.kind || truth.spec?.businessType || 'unknown',
      state: truth.projectState,
    },
    workspace: truth.workspace,
    spec: truth.spec
      ? {
          businessName: truth.spec.businessName,
          businessType: truth.spec.businessType,
          industry: truth.spec.industry,
          category: truth.spec.catalog.category,
          verticalId: truth.spec.catalog.verticalId,
          visualStyle: truth.spec.visualStyle,
          currency: truth.spec.currency,
        }
      : null,
    preview: {
      status: truth.previewStatus === 'failed' ? 'error' : truth.previewStatus,
      url: truth.previewUrl,
    },
    deployment: truth.deployment,
    live: { isLive: live, url: live ? truth.liveUrl : null },
    products,
    customers,
    orders,
    capabilities: truth.capabilities,
    jobs: truth.jobs,
    events: truth.events,
    health: {
      catalogReady: truth.catalogReady,
      paymentsReady: Boolean(truth.paymentsReady),
      previewReady: truth.previewStatus === 'ready' && Boolean(truth.previewUrl),
    },
  })
  const inStockCount = products.filter((p) => (p.stock ?? 0) > 0).length
  const lowStockCount = products.filter(
    (p) => typeof p.stock === 'number' && p.stock > 0 && p.stock <= 5,
  ).length
  const pendingOrderCount = orders.filter((o) => {
    const status = String(o.paymentStatus || o.status || '').toLowerCase()
    return !status || status === 'pending' || status === 'open' || status === 'unpaid'
  }).length
  return {
    ...state,
    catalog: {
      productCount: products.length,
      inStockCount,
      lowStockCount,
    },
    commerce: {
      orderCount: orders.length,
      pendingOrderCount,
    },
    inventory: products
      .filter((p) => typeof p.stock === 'number')
      .map((p) => ({
        id: p.id,
        productId: p.id,
        quantity: p.stock,
      })),
  }
}

export function composeAuthoritativeStateHint(truth: AuthoritativeTruth): string {
  return composeRuntimeStateHint(toBusinessRuntimeState(truth))
}

export function composeRuntimeStateHint(state: BusinessRuntimeState): string {
  const hint = composeBusinessRuntimeStateHint(state)
  if (/catalog\.productCount:/.test(hint)) return hint
  const catalog = state.catalog
  const commerce = state.commerce
  if (!catalog) return hint
  const extra = [
    `catalog.productCount: ${catalog.productCount}`,
    `catalog.inStockCount: ${catalog.inStockCount}`,
    `catalog.lowStockCount: ${catalog.lowStockCount}`,
    `commerce.orderCount: ${commerce?.orderCount ?? state.orders.length}`,
    `commerce.pendingOrderCount: ${commerce?.pendingOrderCount ?? 0}`,
  ].join('\n')
  return hint.replace(
    /health\.previewReady: [^\n]+\n/,
    (m) => `${m}${extra}\n`,
  )
}

export function agentMayClaimPreview(truth: AuthoritativeTruth): boolean {
  return runtimeMayClaimPreview(toBusinessRuntimeState(truth))
}

export function agentMayClaimLive(truth: AuthoritativeTruth): boolean {
  return runtimeMayClaimLive(toBusinessRuntimeState(truth))
}
