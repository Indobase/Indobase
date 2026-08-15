import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isForbiddenAgentClaim } from '@indobase/platform'
import {
  agentMayClaimLive,
  agentMayClaimPreview,
  composeAuthoritativeStateHint,
  toBusinessRuntimeState,
} from './agent-truth.ts'
import { inferBusinessSpec } from './business-spec.ts'

describe('agent truth reconciliation', () => {
  it('forbids preview/live claims without authoritative proof', () => {
    const empty = {
      projectState: 'empty',
      previewStatus: 'absent' as const,
      previewUrl: null,
      liveUrl: null,
      catalogReady: false,
    }
    assert.equal(agentMayClaimPreview(empty), false)
    assert.equal(agentMayClaimLive(empty), false)
    const hint = composeAuthoritativeStateHint(empty)
    assert.match(hint, /BusinessRuntimeState/)
    assert.match(hint, /preview.status: absent/)
    assert.match(hint, /business.spec: none/)
    assert.match(hint, /Never describe a preview as available/)
    assert.match(hint, /Never invent “connection unavailable”/)
    assert.doesNotMatch(hint, /Commerce ABI|guidedBackend/)
    assert.match(hint, /Never say Studio, PocketBase, tenant, provisioner/)
  })

  it('injects BusinessSnapshot so Ask AI can see the current order', () => {
    const spec = inferBusinessSpec('Launch a premium sneaker store called UrbanThread')
    const hint = composeAuthoritativeStateHint({
      projectState: 'live',
      previewStatus: 'ready',
      previewUrl: 'https://urbanthread.sites.indobase.in',
      liveUrl: 'https://urbanthread.sites.indobase.in',
      liveHttpOk: true,
      catalogReady: true,
      spec,
      snapshot: {
        products: [{ id: '1', name: 'Apex Runner', priceMinor: 1299900 }],
        orders: [
          {
            id: 'fxeuxgfdcoq8dzs',
            status: 'pending',
            amount_minor: 480000,
            customer_name: 'Priya Shopper',
            items: 'Apex Runner',
          },
        ],
      },
    })
    // Snapshot injection is the point of this test; LIVE speech also needs a LiveClaim
    // + ecommerce release gate, covered elsewhere.
    assert.match(hint, /UrbanThread/)
    assert.match(hint, /sneakers/)
    assert.match(hint, /Apex Runner/)
    assert.match(hint, /#fxeuxgfdcoq8dzs/)
    assert.match(hint, /payment=pending/)
    assert.match(hint, /fulfillment=unfulfilled/)
    assert.match(hint, /Priya Shopper/)
    assert.match(hint, /orders \(from BusinessRuntimeState\)/)
    assert.match(hint, /Answer “show latest order”/)
    const runtime = toBusinessRuntimeState({
      projectState: 'live',
      previewStatus: 'ready',
      previewUrl: 'https://urbanthread.sites.indobase.in',
      liveUrl: 'https://urbanthread.sites.indobase.in',
      liveHttpOk: true,
      catalogReady: true,
      spec,
      snapshot: {
        products: [{ id: '1', name: 'Apex Runner', priceMinor: 1299900 }],
        orders: [{ id: 'fxeuxgfdcoq8dzs', status: 'pending', amount_minor: 480000 }],
      },
    })
    assert.equal(isForbiddenAgentClaim(runtime, 'orders-unavailable'), true)
  })
  it('forbids unavailable claims when BusinessRuntimeState lists the order', () => {
    const runtime = toBusinessRuntimeState({
      projectState: 'preview_ready',
      previewStatus: 'absent',
      previewUrl: null,
      liveUrl: null,
      catalogReady: true,
      snapshot: {
        products: [{ id: '1', name: 'Apex Runner' }],
        orders: [{ id: 'fxeuxgfdcoq8dzs', status: 'pending' }],
      },
    })
    assert.equal(agentMayClaimPreview({
      projectState: 'preview_ready',
      previewStatus: 'absent',
      previewUrl: null,
      liveUrl: null,
      catalogReady: true,
    }), false)
    assert.equal(isForbiddenAgentClaim(runtime, 'preview'), true)
    assert.equal(isForbiddenAgentClaim(runtime, 'live'), true)
    assert.equal(isForbiddenAgentClaim(runtime, 'orders-unavailable'), true)
    assert.equal(isForbiddenAgentClaim(runtime, 'products-unavailable'), true)
  })
})
