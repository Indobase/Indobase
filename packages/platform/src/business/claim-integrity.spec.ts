import { describe, expect, it } from 'vitest'
import {
  capabilityMayClaimReady,
  completedClaimAllowed,
  detectFabricatedClaims,
  sanitizeAgentNarration,
} from './claim-integrity'
import { emptyBusinessRuntimeState } from './runtime-state'

describe('claim integrity', () => {
  const empty = emptyBusinessRuntimeState()

  it('only READY capabilities may be narrated as done', () => {
    expect(capabilityMayClaimReady(undefined)).toBe(false)
    expect(capabilityMayClaimReady('requested')).toBe(false)
    expect(capabilityMayClaimReady('planned')).toBe(false)
    expect(capabilityMayClaimReady('executing')).toBe(false)
    expect(capabilityMayClaimReady('failed')).toBe(false)
    expect(capabilityMayClaimReady('ready')).toBe(true)
  })

  it('forbids preview/live/database speech on an empty runtime', () => {
    const hits = detectFabricatedClaims(
      'Your store is ready. Customer database enabled. Now live at https://example.com',
      empty,
    )
    expect(hits).toEqual(expect.arrayContaining(['preview', 'live', 'capability']))
    expect(completedClaimAllowed(empty, 'preview')).toBe(false)
    const cleaned = sanitizeAgentNarration(
      'Your store is ready. Customer database enabled.',
      empty,
    )
    expect(cleaned).not.toMatch(/store is ready/i)
    expect(cleaned).not.toMatch(/Customer database enabled/i)
  })

  it('allows preview speech only when preview is ready with a URL', () => {
    const ready = emptyBusinessRuntimeState({
      preview: { status: 'ready', url: 'https://builder.indobase.in/live/x/' },
      health: { catalogReady: false, paymentsReady: false, previewReady: true },
    })
    expect(completedClaimAllowed(ready, 'preview')).toBe(true)
    expect(detectFabricatedClaims('Your store is ready to browse.', ready)).toEqual([])
  })

  it('forbids order availability without BusinessSnapshot orders', () => {
    const hits = detectFabricatedClaims('Orders are available in your store.', empty)
    expect(hits).toContain('orders')
  })

  it('forbids “orders unavailable” speech when snapshot lists an order', () => {
    const withOrder = emptyBusinessRuntimeState({
      orders: [
        {
          id: 'zvka8renspuyufi',
          orderNumber: 'zvka8renspuyufi',
          status: 'pending',
          amountMinor: 18900,
          customerName: 'Priya Shopper',
          itemsSummary: 'Thread One/Bone',
        },
      ],
    })
    const speech =
      'The commerce admin service isn’t available. No order data was returned.'
    expect(detectFabricatedClaims(speech, withOrder)).toContain('orders-unavailable')
    expect(completedClaimAllowed(withOrder, 'orders-unavailable')).toBe(false)
    const cleaned = sanitizeAgentNarration(speech, withOrder)
    expect(cleaned).not.toMatch(/isn.?t available|no order data/i)
    expect(cleaned).toMatch(/zvka8renspuyufi/)
    expect(cleaned).toMatch(/Priya Shopper/)
  })

  it('forbids “store not in this workspace” when preview is ready', () => {
    const ready = emptyBusinessRuntimeState({
      preview: { status: 'ready', url: 'https://builder.indobase.in/live/x/' },
      health: { catalogReady: false, paymentsReady: false, previewReady: true },
    })
    const speech = 'That store is not in this workspace and isn’t currently available.'
    expect(detectFabricatedClaims(speech, ready)).toContain('store-missing')
    const cleaned = sanitizeAgentNarration(speech, ready)
    expect(cleaned).not.toMatch(/not in this workspace/i)
    expect(cleaned).toMatch(/this workspace/)
  })

  it('forbids “command isn’t available” when preview is ready', () => {
    const ready = emptyBusinessRuntimeState({
      preview: { status: 'ready', url: 'https://builder.indobase.in/live/x/' },
      health: { catalogReady: false, paymentsReady: false, previewReady: true },
    })
    const speech = 'The persisted-preview editing command isn’t available.'
    expect(detectFabricatedClaims(speech, ready)).toContain('command-unavailable')
    const cleaned = sanitizeAgentNarration(speech, ready)
    expect(cleaned).not.toMatch(/isn.?t available/i)
  })

  it('rewrites tool-name and refuse-launch leaks from runtime state', () => {
    const ready = emptyBusinessRuntimeState({
      preview: { status: 'ready', url: 'https://builder.indobase.in/live/x/' },
      health: { catalogReady: false, paymentsReady: false, previewReady: true },
    })
    const leaked =
      'Call for Go Live, prove with placeTestShopOrder, emit Wire / Go Live chips — do not restart guest/auth. I can\'t truthfully confirm a production launch.'
    const cleaned = sanitizeAgentNarration(leaked, ready)
    expect(cleaned).not.toMatch(/placeTestShopOrder|truthfully|do not restart|Wire \/ Go Live/i)
    expect(cleaned).toMatch(/ready to review/i)
  })
})
