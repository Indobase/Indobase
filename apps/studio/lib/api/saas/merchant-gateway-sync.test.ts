import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./payments-mcp', () => ({
  mintPaymentsMcpBearer: vi.fn(async () => ({
    apiBaseUrl: 'https://api.payments.test',
    bearerToken: 'token',
    organizationSlug: 'acme',
    projectRef: 'abcdefghijklmnop',
    role: 'owner',
  })),
  createPaymentsApiClient: vi.fn(({ bearerToken }: { bearerToken: string }) => ({
    apiBaseUrl: 'https://api.payments.test',
    request: vi.fn(async (_method: string, path: string) => {
      if (path.includes('razorpay')) {
        return { connector: { id: 'ctr_rzp', alias: 'india', provider: 'razorpay' } }
      }
      return { connector: { id: 'ctr_stripe', alias: 'international', provider: 'stripe' } }
    }),
    _token: bearerToken,
  })),
}))

import { createPaymentsApiClient } from './payments-mcp'
import { syncMerchantGatewayKeysToPayments } from './merchant-gateway-sync'

describe('merchant-gateway-sync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('syncs Razorpay keys to Payments connector', async () => {
    const result = await syncMerchantGatewayKeysToPayments({
      claims: { sub: 'user-1', email: 'ops@example.com' },
      ref: 'abcdefghijklmnop',
      market: 'india',
      razorpay: { keyId: 'rzp_test_abc', keySecret: 'secretsecretsecret' },
    })
    expect(result.ok).toBe(true)
    expect(result.alias).toBe('india')
    expect(result.provider).toBe('razorpay')
    expect(createPaymentsApiClient).toHaveBeenCalled()
  })

  it('syncs Stripe keys to Payments connector', async () => {
    const result = await syncMerchantGatewayKeysToPayments({
      claims: { sub: 'user-1', email: 'ops@example.com' },
      ref: 'abcdefghijklmnop',
      market: 'international',
      stripe: {
        secretKey: 'sk_test_abc',
        publishableKey: 'pk_test_abc',
      },
    })
    expect(result.ok).toBe(true)
    expect(result.alias).toBe('international')
    expect(result.provider).toBe('stripe')
  })
})
