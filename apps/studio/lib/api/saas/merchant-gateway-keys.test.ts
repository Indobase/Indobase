import { afterEach, describe, expect, it, vi } from 'vitest'

import { hintId, validateRazorpayKeys, validateStripeKeys } from './merchant-gateway-keys'

describe('merchant-gateway-keys', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('masks key hints', () => {
    expect(hintId('rzp_live_abcdefgh')).toBe('rzp_…efgh')
    expect(hintId('short')).toBe('••••')
  })

  it('rejects invalid Razorpay auth responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      })
    )
    await expect(validateRazorpayKeys('rzp_test_x', 'secretsecretsecret')).rejects.toThrow(
      /Invalid Razorpay/
    )
  })

  it('accepts valid Razorpay key probe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{}',
      })
    )
    await expect(validateRazorpayKeys('rzp_test_x', 'secretsecretsecret')).resolves.toBeUndefined()
  })

  it('rejects invalid Stripe secret responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      })
    )
    await expect(validateStripeKeys('sk_test_x')).rejects.toThrow(/Invalid Stripe/)
  })
})
