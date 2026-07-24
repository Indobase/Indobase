/**
 * Merchant onboarding provider — settlement-adapter shaped.
 *
 * Default money path today is **Stripe** (Indobase Payments connector). Razorpay
 * Route Linked Accounts remain the India aggregator target; the stub keeps that
 * interface ready without half-wired HTTP calls.
 *
 * Not Indobase plan billing (`razorpay-billing.ts`).
 */

import type { MerchantKycStatus } from './merchant-kyc-types'

export type { MerchantKycStatus }

export type SettlementAdapter = 'stripe' | 'razorpay_route'

export type AggregatorLinkedAccountInput = {
  projectRef: string
  businessLegalName: string
  businessType: string | null
  pan: string | null
  gstin: string | null
  contactEmail: string | null
  contactPhone: string | null
  bankAccountHolderName: string | null
  bankAccountLast4: string | null
  bankIfsc: string | null
}

export type AggregatorLinkedAccountResult = {
  accountId: string
  status: 'created' | 'pending' | 'active' | 'rejected' | 'stubbed'
  provider: SettlementAdapter
  /** True when no live aggregator credentials were used. */
  stubbed: boolean
  message: string
  meta: Record<string, unknown>
}

export interface MerchantOnboardingProvider {
  createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult>
  syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult>
}

export function resolveSettlementAdapter(): SettlementAdapter {
  const raw = (
    process.env.INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER ||
    process.env.PAYMENTS_SETTLEMENT_ADAPTER ||
    'stripe'
  )
    .trim()
    .toLowerCase()
  if (raw === 'razorpay_route' || raw === 'razorpay' || raw === 'route') {
    return 'razorpay_route'
  }
  return 'stripe'
}

function razorpayRouteKeysConfigured(): boolean {
  const keyId =
    process.env.RAZORPAY_ROUTE_KEY_ID?.trim() ||
    process.env.INDOBASE_PAYMENTS_RAZORPAY_KEY_ID?.trim() ||
    ''
  const keySecret =
    process.env.RAZORPAY_ROUTE_KEY_SECRET?.trim() ||
    process.env.INDOBASE_PAYMENTS_RAZORPAY_KEY_SECRET?.trim() ||
    ''
  return keyId.length > 0 && keySecret.length > 0
}

/**
 * Stripe settlement path: KYC collects merchant identity/bank metadata in Studio;
 * live charges run through Indobase Payments' Stripe adapter after go-live confirm.
 */
export class StripeSettlementOnboardingProvider implements MerchantOnboardingProvider {
  async createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult> {
    const accountId = `stripe_merchant_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`

    return {
      accountId,
      status: 'pending',
      provider: 'stripe',
      stubbed: false,
      message:
        'Merchant KYC submitted for Stripe settlement. An organization owner or admin must confirm go-live in Studio, then connect Stripe in Indobase Payments (keys + webhook) before live charges.',
      meta: {
        settlement_adapter: 'stripe',
        business_legal_name: input.businessLegalName,
        bank_last4: input.bankAccountLast4,
        created_at: new Date().toISOString(),
      },
    }
  }

  async syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult> {
    return {
      accountId,
      status: 'pending',
      provider: 'stripe',
      stubbed: false,
      message:
        'Stripe merchant status is confirmed in Studio (go-live) and via the Payments Stripe connector — not via Razorpay Route sync.',
      meta: { synced_at: new Date().toISOString(), settlement_adapter: 'stripe' },
    }
  }
}

/**
 * Stub provider: records a deterministic placeholder linked-account id and leaves
 * live Razorpay Route HTTP for a later connector. When keys are present, still
 * stubs until the HTTP client is implemented — avoids half-wired production calls.
 */
export class StubRazorpayRouteProvider implements MerchantOnboardingProvider {
  async createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult> {
    const keysPresent = razorpayRouteKeysConfigured()
    const accountId = `acc_stub_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`

    return {
      accountId,
      status: 'stubbed',
      provider: 'razorpay_route',
      stubbed: true,
      message: keysPresent
        ? 'Razorpay Route keys detected; live Linked Account API not wired yet — stored stub account id.'
        : 'No Razorpay Route keys configured — stored stub linked-account id. Settlements will use the merchant bank account once the aggregator is connected.',
      meta: {
        keys_present: keysPresent,
        business_legal_name: input.businessLegalName,
        bank_last4: input.bankAccountLast4,
        created_at: new Date().toISOString(),
        settlement_adapter: 'razorpay_route',
      },
    }
  }

  async syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult> {
    return {
      accountId,
      status: 'stubbed',
      provider: 'razorpay_route',
      stubbed: true,
      message: 'Live Linked Account status sync is not wired yet.',
      meta: { synced_at: new Date().toISOString(), settlement_adapter: 'razorpay_route' },
    }
  }
}

let cachedProvider: MerchantOnboardingProvider | null = null

export function getMerchantOnboardingProvider(): MerchantOnboardingProvider {
  if (!cachedProvider) {
    cachedProvider =
      resolveSettlementAdapter() === 'razorpay_route'
        ? new StubRazorpayRouteProvider()
        : new StripeSettlementOnboardingProvider()
  }
  return cachedProvider
}

/** Test helper — reset singleton between unit tests. */
export function __resetMerchantOnboardingProviderForTests() {
  cachedProvider = null
}
