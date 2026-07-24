import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  StubRazorpayRouteProvider,
  __resetMerchantOnboardingProviderForTests,
  getMerchantOnboardingProvider,
} from './merchant-kyc-provider'

describe('merchant-kyc-provider', () => {
  afterEach(() => {
    __resetMerchantOnboardingProviderForTests()
    vi.unstubAllEnvs()
  })

  it('stubs linked account without Razorpay keys', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_KEY_ID', '')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_SECRET', '')
    const provider = new StubRazorpayRouteProvider()
    const result = await provider.createOrUpdateLinkedAccount({
      projectRef: 'abcdefghijklmnop',
      businessLegalName: 'Acme India Pvt Ltd',
      businessType: 'private_limited',
      pan: 'ABCDE1234F',
      gstin: null,
      contactEmail: 'ops@example.com',
      contactPhone: null,
      bankAccountHolderName: 'Acme India Pvt Ltd',
      bankAccountLast4: '7890',
      bankIfsc: 'HDFC0001234',
    })

    expect(result.stubbed).toBe(true)
    expect(result.provider).toBe('razorpay_route')
    expect(result.accountId).toMatch(/^acc_stub_/)
    expect(result.meta.keys_present).toBe(false)
  })

  it('still stubs when keys are present until live API is wired', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_KEY_ID', 'rzp_test_key')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_SECRET', 'rzp_test_secret')
    const provider = getMerchantOnboardingProvider()
    const result = await provider.createOrUpdateLinkedAccount({
      projectRef: 'projref123',
      businessLegalName: 'Test Co',
      businessType: 'proprietorship',
      pan: null,
      gstin: null,
      contactEmail: null,
      contactPhone: null,
      bankAccountHolderName: null,
      bankAccountLast4: null,
      bankIfsc: null,
    })

    expect(result.stubbed).toBe(true)
    expect(result.meta.keys_present).toBe(true)
    expect(result.message).toMatch(/not wired yet/i)
  })
})
