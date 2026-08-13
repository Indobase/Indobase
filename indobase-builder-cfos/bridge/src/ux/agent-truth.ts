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
  products: Array<{ id?: string; name?: string; priceMinor?: number }>
  orders: Array<{
    id?: string
    orderNumber?: string
    status?: string
    payment_status?: string
    amount_minor?: number
    email?: string
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
  paymentsReady?: boolean
}

export function toBusinessRuntimeState(truth: AuthoritativeTruth): BusinessRuntimeState {
  const snap = truth.snapshot
  const live = Boolean(truth.liveUrl) && truth.projectState === 'live'
  return emptyBusinessRuntimeState({
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
    products: (snap?.products || [])
      .filter((p) => p.id || p.name)
      .map((p) => ({
        id: p.id || p.name || '',
        name: p.name || p.id || '',
        priceMinor: p.priceMinor,
      })),
    customers: (snap?.customers || [])
      .filter((c) => c.id || c.email)
      .map((c) => ({
        id: c.id || c.email || '',
        email: c.email,
        name: c.name,
      })),
    orders: (snap?.orders || [])
      .filter((o) => o.id || o.orderNumber)
      .map((o) => ({
        id: o.id || o.orderNumber || '',
        orderNumber: o.orderNumber || o.id,
        status: o.status,
        paymentStatus: o.payment_status,
        amountMinor: o.amount_minor,
        email: o.email,
      })),
    capabilities: truth.capabilities,
    jobs: truth.jobs,
    health: {
      catalogReady: truth.catalogReady,
      paymentsReady: Boolean(truth.paymentsReady),
      previewReady: truth.previewStatus === 'ready' && Boolean(truth.previewUrl),
    },
  })
}

export function composeAuthoritativeStateHint(truth: AuthoritativeTruth): string {
  return composeBusinessRuntimeStateHint(toBusinessRuntimeState(truth))
}

export function composeRuntimeStateHint(state: BusinessRuntimeState): string {
  return composeBusinessRuntimeStateHint(state)
}

export function agentMayClaimPreview(truth: AuthoritativeTruth): boolean {
  return runtimeMayClaimPreview(toBusinessRuntimeState(truth))
}

export function agentMayClaimLive(truth: AuthoritativeTruth): boolean {
  return runtimeMayClaimLive(toBusinessRuntimeState(truth))
}
