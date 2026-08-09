import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncMerchantGatewayKeysToPayments } from './merchant-gateway-sync'

describe('merchant-gateway-sync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('records Studio-only Razorpay readiness without Payments engine', async () => {
    const result = await syncMerchantGatewayKeysToPayments({
      claims: { sub: 'user-1', email: 'ops@example.com' },
      ref: 'abcdefghijklmnop',
      market: 'india',
      razorpay: { keyId: 'rzp_test_abc', keySecret: 'secretsecretsecret' },
    })
    expect(result.ok).toBe(true)
    expect(result.alias).toBe('india')
    expect(result.provider).toBe('razorpay')
    expect(result.message).toMatch(/Studio/i)
  })

  it('records Studio-only Stripe readiness without Payments engine', async () => {
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
    expect(result.message).toMatch(/Studio/i)
  })

  it('fails when keys missing', async () => {
    const result = await syncMerchantGatewayKeysToPayments({
      claims: { sub: 'user-1', email: 'ops@example.com' },
      ref: 'abcdefghijklmnop',
      market: 'india',
    })
    expect(result.ok).toBe(false)
  })
})
