/**
 * Merchant settlement market helpers + BYOK onboarding guidance.
 *
 * Merchants create accounts / finish KYC on Razorpay or Stripe, then paste API
 * keys in Studio (Connect gateway). Studio does **not** create Razorpay Route
 * Linked Accounts or Stripe Connect Account Links as a product path.
 *
 * Not Indobase plan billing (`razorpay-billing.ts`).
 */

import type { MerchantKycStatus } from './merchant-kyc-types'

export type { MerchantKycStatus }

/** Stored rail id (legacy `razorpay_route` name kept for DB / agent compatibility). */
export type SettlementAdapter = 'stripe' | 'razorpay_route'

/** Operator-facing market (maps 1:1 to settlement adapter). */
export type SettlementMarket = 'india' | 'international'

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
  /** Full account number when collected for merchant profile (never logged). */
  bankAccountNumber?: string | null
  businessAddressLine1?: string | null
  businessAddressLine2?: string | null
  businessCity?: string | null
  businessState?: string | null
  businessPostalCode?: string | null
  businessCountry?: string | null
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

export function settlementMarketForAdapter(adapter: SettlementAdapter): SettlementMarket {
  return adapter === 'razorpay_route' ? 'india' : 'international'
}

export function adapterForSettlementMarket(market: SettlementMarket): SettlementAdapter {
  return market === 'india' ? 'razorpay_route' : 'stripe'
}

/** Accept india/international or razorpay/stripe aliases from OS ensure / agent chips. */
export function normalizeSettlementMarket(raw: string | null | undefined): SettlementMarket | null {
  const adapter = normalizeSettlementAdapter(raw)
  if (!adapter) return null
  return settlementMarketForAdapter(adapter)
}

export function normalizeSettlementAdapter(raw: string | null | undefined): SettlementAdapter | null {
  const value = (raw || '').trim().toLowerCase()
  if (!value) return null
  if (value === 'razorpay_route' || value === 'razorpay' || value === 'route' || value === 'india') {
    return 'razorpay_route'
  }
  if (value === 'stripe' || value === 'international' || value === 'cards') {
    return 'stripe'
  }
  return null
}

/**
 * Resolve settlement rail for BYOK key validation / checkout wiring.
 *
 * Priority:
 * 1. Explicit env force (`INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER`)
 * 2. Stored project `aggregator_provider`
 * 3. Business country `IN` → India (Razorpay); else Stripe
 * 4. Default Stripe
 */
export function resolveSettlementAdapter(opts?: {
  country?: string | null
  storedProvider?: string | null
}): SettlementAdapter {
  const envForced = normalizeSettlementAdapter(
    process.env.INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER || process.env.PAYMENTS_SETTLEMENT_ADAPTER
  )
  if (
    process.env.INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER?.trim() ||
    process.env.PAYMENTS_SETTLEMENT_ADAPTER?.trim()
  ) {
    return envForced || 'stripe'
  }

  const stored = normalizeSettlementAdapter(opts?.storedProvider)
  if (stored) return stored

  const country = (opts?.country || '').trim().toUpperCase()
  if (country === 'IN' || country === 'IND') return 'razorpay_route'

  return 'stripe'
}

/** BYOK guidance — Studio never mints platform sub-accounts. */
export class ByokSettlementOnboardingProvider implements MerchantOnboardingProvider {
  constructor(private readonly adapter: SettlementAdapter) {}

  async createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult> {
    const market = settlementMarketForAdapter(this.adapter)
    const message =
      market === 'india'
        ? 'Complete KYC on the Razorpay Dashboard, then paste Key Id + Key Secret in Studio Payments → Connect gateway (agents can wire checkout after keys are saved).'
        : 'Complete verification on the Stripe Dashboard, then paste secret + publishable keys in Studio Payments → Connect gateway (agents can wire checkout after keys are saved).'
    return {
      accountId: `byok_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`,
      status: 'pending',
      provider: this.adapter,
      stubbed: true,
      message,
      meta: {
        byok: true,
        settlement_adapter: this.adapter,
        settlement_market: market,
        gateway_keys_url:
          market === 'india'
            ? 'https://dashboard.razorpay.com/app/keys'
            : 'https://dashboard.stripe.com/apikeys',
        created_at: new Date().toISOString(),
      },
    }
  }

  async syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult> {
    return {
      accountId,
      status: 'pending',
      provider: this.adapter,
      stubbed: true,
      message:
        'Waiting for API keys — paste Razorpay or Stripe keys in Studio Payments → Connect gateway.',
      meta: {
        byok: true,
        synced_at: new Date().toISOString(),
        settlement_adapter: this.adapter,
        settlement_market: settlementMarketForAdapter(this.adapter),
      },
    }
  }
}

export function getMerchantOnboardingProvider(
  adapter: SettlementAdapter = resolveSettlementAdapter()
): MerchantOnboardingProvider {
  return new ByokSettlementOnboardingProvider(adapter)
}

/** @deprecated No-op — kept for older tests. */
export function __resetMerchantOnboardingProviderForTests() {
  // No singleton cache.
}
