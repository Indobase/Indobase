import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isPaidRazorpaySubscriptionStatus,
  verifyRazorpaySubscriptionForOrg,
} from './razorpay-billing'
import { executeQuery } from './query'

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

const executeQueryMock = vi.mocked(executeQuery)

describe('razorpay-billing security', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    executeQueryMock.mockReset()
  })

  it('treats only active/authenticated Razorpay subscriptions as paid', () => {
    expect(isPaidRazorpaySubscriptionStatus('active')).toBe(true)
    expect(isPaidRazorpaySubscriptionStatus('authenticated')).toBe(true)
    expect(isPaidRazorpaySubscriptionStatus('created')).toBe(false)
    expect(isPaidRazorpaySubscriptionStatus('cancelled')).toBe(false)
  })

  it('rejects subscription confirmation when org subscription id does not match', async () => {
    executeQueryMock.mockResolvedValueOnce({
      data: [
        {
          subscription_id: 'sub_expected',
          billing_pending_tier: 'tier_pro',
          plan: 'free',
        },
      ],
      error: undefined,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'sub_other',
          status: 'active',
          plan_id: 'plan_123',
          notes: { org_slug: 'acme', indobase_plan_id: 'pro' },
        }),
      })
    )

    const result = await verifyRazorpaySubscriptionForOrg({
      orgSlug: 'acme',
      subscriptionId: 'sub_other',
      expectedPlanId: 'pro',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('does not match')
    }
  })
})
