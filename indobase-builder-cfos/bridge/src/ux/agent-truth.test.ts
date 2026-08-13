import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  agentMayClaimLive,
  agentMayClaimPreview,
  composeAuthoritativeStateHint,
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
    assert.match(hint, /preview.status: absent/)
    assert.match(hint, /Never describe a preview as available/)
    assert.match(hint, /Never say the launch service/)
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
      catalogReady: true,
      spec,
      snapshot: {
        products: [{ id: '1', name: 'Apex Runner', priceMinor: 1299900 }],
        orders: [{ id: 'fxeuxgfdcoq8dzs', status: 'pending', amount_minor: 480000 }],
      },
    })
    assert.equal(
      agentMayClaimLive({
        projectState: 'live',
        previewStatus: 'ready',
        previewUrl: 'https://urbanthread.sites.indobase.in',
        liveUrl: 'https://urbanthread.sites.indobase.in',
        catalogReady: true,
      }),
      true,
    )
    assert.match(hint, /UrbanThread/)
    assert.match(hint, /sneakers/)
    assert.match(hint, /Apex Runner/)
    assert.match(hint, /#fxeuxgfdcoq8dzs/)
    assert.match(hint, /SCREEN show-order: answer from the snapshot/)
  })
})
