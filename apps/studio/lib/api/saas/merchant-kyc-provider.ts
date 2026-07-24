/**
 * Merchant onboarding provider — Route / Linked-Accounts shaped.
 *
 * Indobase Payments intends settlements to the merchant's own bank account via a
 * licensed aggregator (e.g. Razorpay Route). This interface is the plug-in point;
 * the stub works without live API keys so Studio KYC UI can ship first.
 *
 * Not Indobase plan billing (`razorpay-billing.ts`).
 */

import type { MerchantKycStatus } from './merchant-kyc-types'

export type { MerchantKycStatus }

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
  /** Placeholder until Razorpay Route Linked Accounts are wired. */
  accountId: string
  status: 'created' | 'pending' | 'active' | 'rejected' | 'stubbed'
  provider: 'razorpay_route'
  /** True when no live Razorpay credentials were used. */
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
      meta: { synced_at: new Date().toISOString() },
    }
  }
}

let cachedProvider: MerchantOnboardingProvider | null = null

export function getMerchantOnboardingProvider(): MerchantOnboardingProvider {
  if (!cachedProvider) {
    cachedProvider = new StubRazorpayRouteProvider()
  }
  return cachedProvider
}

/** Test helper — reset singleton between unit tests. */
export function __resetMerchantOnboardingProviderForTests() {
  cachedProvider = null
}
