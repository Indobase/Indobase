/**
 * Authoritative state the agent must speak from.
 * UI, Control Center, and chat consume BusinessRuntimeState — never two truths.
 */

import {
  agentMayClaimLive as runtimeMayClaimLive,
  agentMayClaimPreview as runtimeMayClaimPreview,
  commerceFromOrders,
  composeBusinessRuntimeStateHint,
  catalogFromProducts,
  inventoryFromProducts,
  emptyBusinessRuntimeState,
  isForbiddenAgentClaim,
  type BusinessRuntimeState,
} from '@indobase/platform'

import { persistCatalogProjection } from './catalog-domain.js'

import type { BusinessSpec } from './business-spec.js'
import { getLiveClaim } from './live-claim-store.js'
import type { PreviewStatus } from './preview-gate.js'

export type { BusinessRuntimeState }
export { isForbiddenAgentClaim }

export type BusinessSnapshotSummary = {
  products: Array<{
    id?: string
    name?: string
    priceMinor?: number
    slug?: string
    stock?: number
    variants?: Array<{
      id?: string
      sku?: string
      title?: string
      options?: Record<string, string>
      priceMinor?: number
      stock?: number
      default?: boolean
    }>
  }>
  collections?: Array<{
    id?: string
    name?: string
    slug?: string
    productIds?: string[]
    rule?: { category?: string; tag?: string } | null
  }>
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
    created_at?: string
    createdAt?: string
  }>
  customers?: Array<{ id?: string; email?: string; name?: string }>
}

export type AuthoritativeTruth = {
  projectState: string
  previewStatus: PreviewStatus
  previewUrl: string | null
  previewHttpOk?: boolean | null
  liveUrl: string | null
  liveHttpOk?: boolean | null
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
  const products = persistCatalogProjection(
    (snap?.products || [])
      .filter((p) => p.id || p.name)
      .map((p) => ({
        id: p.id || p.name || '',
        name: p.name || p.id || '',
        priceMinor: p.priceMinor,
        stock: typeof p.stock === 'number' ? p.stock : undefined,
        variants: (p.variants || []).map((v) => ({
          id: v.id || '',
          sku: v.sku,
          title: v.title,
          options: v.options,
          priceMinor: v.priceMinor,
          stock: v.stock,
          default: v.default,
        })),
      })),
  )
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
      createdAt: typeof (o.createdAt || o.created_at) === 'string' ? String(o.createdAt || o.created_at) : undefined,
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
      httpOk: truth.previewHttpOk ?? null,
    },
    deployment: truth.deployment,
    live: {
      isLive: live && truth.liveHttpOk !== false,
      url: live ? truth.liveUrl : null,
      httpOk: truth.liveHttpOk ?? null,
      artifactHash: truth.liveUrl ? getLiveClaim(truth.workspace?.ref || truth.business?.ref || '')?.artifactHash : null,
      claim: live ? getLiveClaim(truth.workspace?.ref || truth.business?.ref || '') : null,
    },
    products,
    customers,
    orders,
    catalog: {
      collections: (snap?.collections || [])
        .filter((c) => c.id || c.name)
        .map((c) => ({
          id: c.id || c.name || '',
          name: c.name || c.id || '',
          slug: c.slug,
          productIds: c.productIds || [],
          rule: c.rule || null,
        })),
    },
    capabilities: truth.capabilities,
    jobs: truth.jobs,
    events: truth.events,
    health: {
      catalogReady: truth.catalogReady,
      paymentsReady: Boolean(truth.paymentsReady),
      previewReady: truth.previewStatus === 'ready' && Boolean(truth.previewUrl) && truth.previewHttpOk !== false,
    },
  })
  const catalogStats = catalogFromProducts(products)
  return {
    ...state,
    catalog: {
      ...catalogStats,
      collections: state.catalog.collections || [],
    },
    commerce: commerceFromOrders(orders),
    inventory: inventoryFromProducts(products),
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
