import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ByokSettlementOnboardingProvider,
  __resetMerchantOnboardingProviderForTests,
  adapterForSettlementMarket,
  getMerchantOnboardingProvider,
  normalizeSettlementMarket,
  resolveSettlementAdapter,
  settlementMarketForAdapter,
} from './merchant-kyc-provider'

describe('merchant-kyc-provider', () => {
  afterEach(() => {
    __resetMerchantOnboardingProviderForTests()
    vi.unstubAllEnvs()
  })

  it('always uses BYOK onboarding (no platform Connect/Route)', async () => {
    const provider = getMerchantOnboardingProvider('stripe')
    const result = await provider.createOrUpdateLinkedAccount({
      projectRef: 'abcdefghijklmnop',
      businessLegalName: 'Acme',
      businessType: 'private_limited',
      pan: null,
      gstin: null,
      contactEmail: 'ops@example.com',
      contactPhone: null,
      bankAccountHolderName: null,
      bankAccountLast4: null,
      bankIfsc: null,
    })
    expect(result.stubbed).toBe(true)
    expect(result.meta.byok).toBe(true)
    expect(result.message).toMatch(/paste/i)
    expect(result.accountId).toMatch(/^byok_/)
  })

  it('BYOK India rail points at Razorpay dashboard keys', async () => {
    const provider = new ByokSettlementOnboardingProvider('razorpay_route')
    const result = await provider.createOrUpdateLinkedAccount({
      projectRef: 'abcdefghijklmnop',
      businessLegalName: 'Acme India',
      businessType: 'private_limited',
      pan: null,
      gstin: null,
      contactEmail: 'ops@example.com',
      contactPhone: null,
      bankAccountHolderName: null,
      bankAccountLast4: null,
      bankIfsc: null,
    })
    expect(result.provider).toBe('razorpay_route')
    expect(result.meta.gateway_keys_url).toContain('razorpay.com')
    expect(result.message).toMatch(/Razorpay/i)
  })

  it('defaults settlement adapter to stripe when no country/stored', () => {
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', '')
    vi.stubEnv('PAYMENTS_SETTLEMENT_ADAPTER', '')
    expect(resolveSettlementAdapter()).toBe('stripe')
  })

  it('picks India rail for country IN', () => {
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', '')
    expect(resolveSettlementAdapter({ country: 'IN' })).toBe('razorpay_route')
  })

  it('prefers stored provider over country', () => {
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', '')
    expect(
      resolveSettlementAdapter({ country: 'IN', storedProvider: 'stripe' })
    ).toBe('stripe')
  })

  it('maps settlement markets to adapters', () => {
    expect(adapterForSettlementMarket('india')).toBe('razorpay_route')
    expect(adapterForSettlementMarket('international')).toBe('stripe')
    expect(settlementMarketForAdapter('razorpay_route')).toBe('india')
    expect(settlementMarketForAdapter('stripe')).toBe('international')
  })

  it('normalizes agent aliases to settlement markets', () => {
    expect(normalizeSettlementMarket('india')).toBe('india')
    expect(normalizeSettlementMarket('razorpay')).toBe('india')
    expect(normalizeSettlementMarket('international')).toBe('international')
    expect(normalizeSettlementMarket('stripe')).toBe('international')
    expect(normalizeSettlementMarket('nope')).toBeNull()
  })

  it('BYOK sync stays pending until gateway keys are pasted', async () => {
    const provider = getMerchantOnboardingProvider('stripe')
    const synced = await provider.syncLinkedAccountStatus('byok_abc')
    expect(synced.status).toBe('pending')
    expect(synced.provider).toBe('stripe')
    expect(synced.meta.byok).toBe(true)
  })
})
