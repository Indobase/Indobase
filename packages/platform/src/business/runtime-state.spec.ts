import { describe, expect, it } from 'vitest'
import {
  agentMayClaimLive,
  agentMayClaimPreview,
  composeBusinessRuntimeStateHint,
  emptyBusinessRuntimeState,
  isForbiddenAgentClaim,
} from './runtime-state'

describe('BusinessRuntimeState', () => {
  it('forbids preview/live/unavailable claims that contradict the snapshot', () => {
    const state = emptyBusinessRuntimeState({
      business: { ref: 'biz_ut', name: 'UrbanThread', kind: 'store', state: 'preview_ready' },
      preview: { status: 'absent', url: null },
      live: { isLive: false, url: null },
      products: [{ id: '1', name: 'Apex Runner', priceMinor: 1299900, stock: 10 }],
      orders: [{ id: 'fxeuxgfdcoq8dzs', status: 'pending', amountMinor: 480000 }],
      health: { catalogReady: true, paymentsReady: false, previewReady: false },
    })

    expect(agentMayClaimPreview(state)).toBe(false)
    expect(agentMayClaimLive(state)).toBe(false)
    expect(isForbiddenAgentClaim(state, 'preview')).toBe(true)
    expect(isForbiddenAgentClaim(state, 'live')).toBe(true)
    expect(isForbiddenAgentClaim(state, 'orders-unavailable')).toBe(true)
    expect(isForbiddenAgentClaim(state, 'products-unavailable')).toBe(true)
    expect(isForbiddenAgentClaim(state, 'catalog-unavailable')).toBe(true)

    const hint = composeBusinessRuntimeStateHint(state)
    expect(hint).toMatch(/Apex Runner/)
    expect(hint).toMatch(/catalog\.productCount: 1/)
    expect(hint).toMatch(/stock=10/)
    expect(hint).not.toMatch(/conversion rate|ROAS/i)
    expect(hint).toMatch(/#fxeuxgfdcoq8dzs/)
    expect(hint).toMatch(/Never invent “connection unavailable”/)
    expect(hint).toMatch(/Never claim LIVE/)
    expect(hint).toMatch(/Never say Studio, PocketBase/)
    expect(hint).not.toMatch(/Commerce ABI|guidedBackend/)
  })

  it('projects payment and fulfillment separately and never calls paid “fulfilled”', () => {
    const state = emptyBusinessRuntimeState({
      orders: [
        {
          id: 'ordpaid',
          paymentStatus: 'paid',
          fulfillmentStatus: 'unfulfilled',
          amountMinor: 129900,
        },
      ],
    })
    expect(state.commerce.pendingOrderCount).toBe(0)
    const hint = composeBusinessRuntimeStateHint(state)
    expect(hint).toMatch(/payment=paid/)
    expect(hint).toMatch(/fulfillment=unfulfilled/)
    expect(hint).toMatch(/Say an order is fulfilled only when fulfillmentStatus is fulfilled/)
    expect(hint).not.toMatch(/payment=fulfilled/)
  })

  it('allows live/preview only when urls and flags agree', () => {
    const state = emptyBusinessRuntimeState({
      business: { ref: 'biz_ut', name: 'UrbanThread', kind: 'store', state: 'live' },
      preview: { status: 'ready', url: 'https://urbanthread.sites.indobase.in' },
      live: { isLive: true, url: 'https://urbanthread.sites.indobase.in' },
      deployment: { status: 'live', jobId: 'job_live' },
      jobs: [{ id: 'job_live', status: 'live' }],
      health: { catalogReady: true, paymentsReady: false, previewReady: true },
    })
    expect(agentMayClaimPreview(state)).toBe(true)
    expect(agentMayClaimLive(state)).toBe(true)
    expect(isForbiddenAgentClaim(state, 'preview')).toBe(false)
    expect(isForbiddenAgentClaim(state, 'live')).toBe(false)
    expect(isForbiddenAgentClaim(state, 'orders-unavailable')).toBe(false)
  })

  it('displays product price derived from variants, not a stale product field', () => {
    const state = emptyBusinessRuntimeState({
      products: [
        {
          id: '1',
          name: 'Apex Runner',
          priceMinor: 1299900,
          variants: [
            { id: 'v0', priceMinor: 1349900, default: true },
            { id: 'v1', priceMinor: 1349900 },
          ],
        },
      ],
    })
    expect(state.products[0]?.priceMinor).toBe(1349900)
    expect(composeBusinessRuntimeStateHint(state)).toMatch(/₹13499/)
  })
})
