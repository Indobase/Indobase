import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  StubRazorpayRouteProvider,
  StripeSettlementOnboardingProvider,
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
    vi.unstubAllGlobals()
  })

  it('defaults to BYOK onboarding (no platform Connect/Route) unless enabled', async () => {
    vi.stubEnv('INDOBASE_MERCHANT_PLATFORM_ONBOARDING', '')
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

  it('uses Stripe settlement provider when platform onboarding enabled', async () => {
    vi.stubEnv('INDOBASE_MERCHANT_PLATFORM_ONBOARDING', 'true')
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', 'stripe')
    const provider = getMerchantOnboardingProvider()
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

    expect(result.provider).toBe('stripe')
    expect(result.status).toBe('pending')
    // Without STRIPE secret, Account Link is stubbed (docs path still recorded).
    expect(result.accountId).toMatch(/^(stripe_merchant_|acct_)/)
    expect(result.meta.docs_checkout || result.meta.docs).toBeTruthy()
  })

  it('stubs linked account without Razorpay keys when route adapter selected', async () => {
    vi.stubEnv('INDOBASE_MERCHANT_PLATFORM_ONBOARDING', 'true')
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', 'razorpay_route')
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

  it('stubs Route when keys present but required Route fields missing (per Razorpay docs)', async () => {
    vi.stubEnv('INDOBASE_MERCHANT_PLATFORM_ONBOARDING', 'true')
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', 'razorpay_route')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_ID', 'rzp_test_key')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_SECRET', 'rzp_test_secret')
    const provider = getMerchantOnboardingProvider('razorpay_route')
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
    expect(result.message).toMatch(/email|phone|legal_business_name|POST \/v2\/accounts/i)
  })

  it('runs full Route flow: account → stakeholder → product → settlements', async () => {
    vi.stubEnv('INDOBASE_MERCHANT_PLATFORM_ONBOARDING', 'true')
    vi.stubEnv('INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER', 'razorpay_route')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_ID', 'rzp_test_key')
    vi.stubEnv('RAZORPAY_ROUTE_KEY_SECRET', 'rzp_test_secret')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'acc_GLGeLkU2JUeyDZ',
            type: 'route',
            status: 'created',
            email: 'ops@example.com',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'sth_GLGgm8fFCKc92m' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: 'acc_prd_HEgNpywUFctQ9e', activation_status: 'requested' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: 'acc_prd_HEgNpywUFctQ9e', activation_status: 'under_review' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const provider = getMerchantOnboardingProvider('razorpay_route')
    const result = await provider.createOrUpdateLinkedAccount({
      projectRef: 'projref123',
      businessLegalName: 'Acme India Pvt Ltd',
      businessType: 'private_limited',
      pan: 'ABCDE1234F',
      gstin: null,
      contactEmail: 'ops@example.com',
      contactPhone: '9000090000',
      bankAccountHolderName: 'Acme India',
      bankAccountLast4: '7890',
      bankIfsc: 'HDFC0001234',
      bankAccountNumber: '1234567890',
      businessAddressLine1: 'MG Road',
      businessCity: 'Bengaluru',
      businessState: 'KARNATAKA',
      businessPostalCode: '560001',
      businessCountry: 'IN',
    })

    expect(result.stubbed).toBe(false)
    expect(result.accountId).toBe('acc_GLGeLkU2JUeyDZ')
    expect(result.status).toBe('pending')
    expect(result.meta.stakeholder_id).toBe('sth_GLGgm8fFCKc92m')
    expect(result.meta.product_id).toBe('acc_prd_HEgNpywUFctQ9e')
    expect(result.meta.settlements_updated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.razorpay.com/v2/accounts')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.type).toBe('route')
    expect(body.email).toBe('ops@example.com')
    expect(body.phone).toBe('9000090000')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/stakeholders')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/products')
    expect(String(fetchMock.mock.calls[3][0])).toContain('/products/acc_prd_')
    const settlementsBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))
    expect(settlementsBody.settlements.account_number).toBe('1234567890')
    expect(settlementsBody.tnc_accepted).toBe(true)
  })

  it('Stripe provider sync stays pending until Studio go-live', async () => {
    const provider = new StripeSettlementOnboardingProvider()
    const synced = await provider.syncLinkedAccountStatus('stripe_merchant_abc')
    expect(synced.status).toBe('pending')
    expect(synced.provider).toBe('stripe')
  })
})
