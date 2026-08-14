import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { composeAgentHintForSession } from '../session-payload.ts'
import type { Session } from '../auth.ts'
import { toBusinessRuntimeState } from './agent-truth.ts'
import { snapshotFromCommerceRows } from './authoritative-turn.ts'
import { isForbiddenAgentClaim } from '@indobase/platform'

const cookieSession: Session = {
  gotrueId: 'user-real',
  email: 'op@indobase.in',
  projectRef: 'roshfdaaf13e89',
  orgSlug: 'os',
  projectName: 'UrbanThread',
  studioUrl: 'https://studio.indobase.in',
}

const principalSession: Session = {
  gotrueId: 'user-real',
  email: 'op@indobase.in',
  projectRef: 'roshfdaaf13e89',
  orgSlug: 'os',
  projectName: 'UrbanThread',
  studioUrl: 'https://builder.indobase.in',
}

describe('authoritative turn snapshot', () => {
  it('maps PocketBase order rows into BusinessRuntimeState the agent can quote', () => {
    const snapshot = snapshotFromCommerceRows(
      [{ id: 'p1', name: 'Thread One/Bone', slug: 'thread-one-bone', priceMinor: 18900 }],
      [
        {
          id: 'zvka8renspuyufi',
          email: 'priya@shopper.test',
          customer_name: 'Priya Shopper',
          status: 'pending',
          payment_status: 'pending',
          amount_minor: 18900,
          items_json: [{ product_id: 'p1', product_slug: 'thread-one-bone', quantity: 1 }],
        },
      ],
    )
    assert.equal(snapshot.orders[0]?.id, 'zvka8renspuyufi')
    assert.equal(snapshot.orders[0]?.customer_name, 'Priya Shopper')
    assert.equal(snapshot.orders[0]?.items, 'Thread One/Bone')
    assert.equal(snapshot.orders[0]?.fulfillment_status, 'unfulfilled')
    const runtime = toBusinessRuntimeState({
      projectState: 'live',
      previewStatus: 'ready',
      previewUrl: 'https://urbanthread-aaf13e89.sites.indobase.in',
      liveUrl: 'https://urbanthread-aaf13e89.sites.indobase.in',
      catalogReady: true,
      snapshot,
    })
    assert.equal(runtime.orders[0]?.customerName, 'Priya Shopper')
    assert.equal(isForbiddenAgentClaim(runtime, 'orders-unavailable'), true)
  })

  it('cookie session and agent principal compose the same order hint', () => {
    const snapshot = {
      products: [{ id: 'p1', name: 'Thread One/Bone', priceMinor: 18900 }],
      orders: [
        {
          id: 'zvka8renspuyufi',
          status: 'pending',
          amount_minor: 18900,
          customer_name: 'Priya Shopper',
          items: 'Thread One/Bone',
        },
      ],
    }
    const truth = {
      snapshot,
      previewStatus: 'ready' as const,
      previewUrl: 'https://urbanthread-aaf13e89.sites.indobase.in',
      projectState: 'live',
      liveUrl: 'https://urbanthread-aaf13e89.sites.indobase.in',
      catalogReady: true,
    }
    const cookieHint = composeAgentHintForSession(cookieSession, 'Operator hint.', truth)
    const principalHint = composeAgentHintForSession(principalSession, 'Operator hint.', truth)
    assert.match(cookieHint, /#zvka8renspuyufi/)
    assert.match(principalHint, /#zvka8renspuyufi/)
    assert.match(cookieHint, /Priya Shopper/)
    assert.match(principalHint, /Priya Shopper/)
    assert.equal(cookieSession.projectRef, principalSession.projectRef)
  })
})
