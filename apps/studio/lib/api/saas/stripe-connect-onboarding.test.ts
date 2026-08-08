import { afterEach, describe, expect, it, vi } from 'vitest'

import { createStripeConnectOnboardingLink } from './stripe-connect-onboarding'

describe('stripe-connect-onboarding', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('stubs when Stripe secret is missing', async () => {
    vi.stubEnv('INDOBASE_PAYMENTS_STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const result = await createStripeConnectOnboardingLink({
      projectRef: 'projref123',
      email: 'ops@example.com',
    })
    expect(result.stubbed).toBe(true)
    expect(result.onboardingUrl).toBeNull()
    expect(result.message).toMatch(/INDOBASE_PAYMENTS_STRIPE_SECRET_KEY|Account Links/i)
  })

  it('creates account + account_link when secret present', async () => {
    vi.stubEnv('INDOBASE_PAYMENTS_STRIPE_SECRET_KEY', 'sk_test_x')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'acct_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://connect.stripe.com/setup/e/acct_123/abc' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createStripeConnectOnboardingLink({
      projectRef: 'projref123',
      email: 'ops@example.com',
      country: 'US',
    })

    expect(result.stubbed).toBe(false)
    expect(result.accountId).toBe('acct_123')
    expect(result.onboardingUrl).toContain('connect.stripe.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/accounts')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/account_links')
  })
})
