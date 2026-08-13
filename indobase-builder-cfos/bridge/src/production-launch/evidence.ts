/**
 * Machine-derived production evidence. claim_production_ready is computed, not modeled.
 */

import type { VerifierResult } from '../delivery/ecommerce-verifiers.js'
import type { ProductionLaunchJob } from './job-store.js'

export type ProductionLaunchEvidence = {
  backend_ready: boolean
  catalog_seeded: boolean
  storefront_bound: boolean
  commerce_abi_bound: boolean
  no_direct_pb_order_write: boolean
  no_client_price_authority: boolean
  no_client_stock_authority: boolean
  test_order_ok: boolean
  smoke_ok: boolean
  claim_production_ready: boolean
}

export function emptyProductionEvidence(): ProductionLaunchEvidence {
  return {
    backend_ready: false,
    catalog_seeded: false,
    storefront_bound: false,
    commerce_abi_bound: false,
    no_direct_pb_order_write: false,
    no_client_price_authority: false,
    no_client_stock_authority: false,
    test_order_ok: false,
    smoke_ok: false,
    claim_production_ready: false,
  }
}

export function mergeEvidence(
  base: ProductionLaunchEvidence | undefined,
  patch: Partial<ProductionLaunchEvidence>,
): ProductionLaunchEvidence {
  return { ...emptyProductionEvidence(), ...base, ...patch, claim_production_ready: false }
}

export function evidenceFromVerifiers(
  results: VerifierResult[] | undefined,
): Partial<ProductionLaunchEvidence> {
  const byId = new Map((results || []).map((r) => [r.id, r.ok]))
  return {
    commerce_abi_bound: byId.get('COMMERCE_ABI_BOUND') === true,
    no_direct_pb_order_write: byId.get('NO_DIRECT_PB_ORDER_WRITE') === true,
    no_client_price_authority: byId.get('NO_CLIENT_PRICE_AUTHORITY') === true,
    no_client_stock_authority: byId.get('NO_CLIENT_STOCK_AUTHORITY') === true,
  }
}

export function finalizeEvidence(job: ProductionLaunchJob): ProductionLaunchEvidence {
  const e = { ...emptyProductionEvidence(), ...job.evidence }
  const landing = job.appType === 'landing'
  const ecommerce = job.appType === 'ecommerce'
  const live = job.status === 'live' && job.claim_live === true && Boolean(job.url)
  const smoke = job.stages.find((s) => s.id === 'smoke')?.status === 'ok'
  const verify = job.stages.find((s) => s.id === 'verify')?.status === 'ok'

  e.smoke_ok = smoke
  if (landing) {
    e.backend_ready = true
    e.catalog_seeded = true
    e.storefront_bound = true
    e.commerce_abi_bound = true
    e.no_direct_pb_order_write = true
    e.no_client_price_authority = true
    e.no_client_stock_authority = true
    e.test_order_ok = true
  }

  e.claim_production_ready =
    live &&
    smoke &&
    verify &&
    e.backend_ready &&
    e.storefront_bound &&
    (!ecommerce ||
      (e.catalog_seeded &&
        e.commerce_abi_bound &&
        e.no_direct_pb_order_write &&
        e.no_client_price_authority &&
        e.no_client_stock_authority &&
        e.test_order_ok))

  return e
}

export function deriveProductionChecklist(job: ProductionLaunchJob) {
  const evidence = finalizeEvidence({ ...job, evidence: { ...emptyProductionEvidence(), ...job.evidence } })
  return {
    claim_production_ready: evidence.claim_production_ready,
    evidence,
    jobId: job.jobId,
    appType: job.appType,
    live_url: job.url || null,
    source: 'production_job' as const,
  }
}
