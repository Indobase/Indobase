import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./merchant-kyc', () => ({
  assertMerchantCanGoLive: vi.fn(),
  getDecryptedMerchantGatewayKeys: vi.fn(),
}))

vi.mock('./merchant-psp-checkout', () => ({
  createRazorpayHostedCheckout: vi.fn(),
  createStripeHostedCheckout: vi.fn(),
}))

import { assertMerchantCanGoLive, getDecryptedMerchantGatewayKeys } from './merchant-kyc'
import {
  createRazorpayHostedCheckout,
  createStripeHostedCheckout,
} from './merchant-psp-checkout'
import { wirePaymentsCheckout } from './payments-wire-checkout'

describe('wirePaymentsCheckout (naive BYOK)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates Razorpay payment link for India one_time', async () => {
    vi.mocked(assertMerchantCanGoLive).mockResolvedValue({} as never)
    vi.mocked(getDecryptedMerchantGatewayKeys).mockResolvedValue({
      market: 'india',
      razorpay: { keyId: 'rzp_test_x', keySecret: 'secretsecretsecret' },
    })
    vi.mocked(createRazorpayHostedCheckout).mockResolvedValue({
      checkout_url: 'https://rzp.io/i/abc',
      session_id: 'plink_1',
      provider: 'razorpay',
    })

    const result = await wirePaymentsCheckout({
      claims: { sub: 'u1', email: 'a@b.com' },
      ref: 'proj_ref_123456',
      body: {
        mode: 'one_time',
        plan_name: 'Wool Coat',
        price: '480',
        currency: 'INR',
        customer_email: 'buyer@example.com',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.checkout_url).toBe('https://rzp.io/i/abc')
    expect(result.provider).toBe('razorpay')
    expect(createRazorpayHostedCheckout).toHaveBeenCalled()
    expect(createStripeHostedCheckout).not.toHaveBeenCalled()
  })

  it('creates Stripe Checkout for international subscription', async () => {
    vi.mocked(assertMerchantCanGoLive).mockResolvedValue({} as never)
    vi.mocked(getDecryptedMerchantGatewayKeys).mockResolvedValue({
      market: 'international',
      stripe: { secretKey: 'sk_test_x', publishableKey: 'pk_test_x' },
    })
    vi.mocked(createStripeHostedCheckout).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/c/pay/cs_test',
      session_id: 'cs_test',
      plan_version_id: 'price_1',
      provider: 'stripe',
    })

    const result = await wirePaymentsCheckout({
      claims: { sub: 'u1', email: 'a@b.com' },
      ref: 'proj_ref_123456',
      body: {
        plan_name: 'Starter',
        price: '19.99',
        currency: 'USD',
        customer_email: 'buyer@example.com',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.checkout_url).toContain('checkout.stripe.com')
    expect(result.provider).toBe('stripe')
    expect(createStripeHostedCheckout).toHaveBeenCalled()
  })

  it('returns gateway_not_ready when keys missing', async () => {
    vi.mocked(assertMerchantCanGoLive).mockResolvedValue({} as never)
    vi.mocked(getDecryptedMerchantGatewayKeys).mockResolvedValue(null)

    const result = await wirePaymentsCheckout({
      claims: { sub: 'u1', email: 'a@b.com' },
      ref: 'proj_ref_123456',
      body: {
        plan_name: 'Starter',
        price: '999',
        customer_email: 'buyer@example.com',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('gateway_not_ready')
  })
})
