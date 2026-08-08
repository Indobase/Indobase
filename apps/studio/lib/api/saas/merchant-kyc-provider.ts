/**
 * Merchant onboarding provider — dual settlement rails for Indobase Payments.
 *
 * - **International cards** → Stripe (Indobase Payments Stripe connector; live today)
 * - **India** → Razorpay Route Linked Accounts (KYC + stub until Route HTTP ships)
 *
 * OS / Builder agents ask where customers pay, then set `settlement_market`
 * (india → Razorpay, international → Stripe) on the project merchant profile.
 * Chrome still prefers “India settlements” / “International cards”; naming the
 * rail in the ask chips is intentional so the operator’s choice is clear.
 *
 * Not Indobase plan billing (`razorpay-billing.ts`).
 */

import type { MerchantKycStatus } from './merchant-kyc-types'
import { createStripeConnectOnboardingLink } from './stripe-connect-onboarding'

export type { MerchantKycStatus }

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
  /** Full account number for Route product settlements (never logged). */
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
 * Resolve settlement rail.
 *
 * Priority:
 * 1. Explicit env force (`INDOBASE_PAYMENTS_SETTLEMENT_ADAPTER`)
 * 2. Stored project `aggregator_provider`
 * 3. Business country `IN` → Razorpay Route; else Stripe
 * 4. Default Stripe (international cards live today)
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

function razorpayRouteCredentials(): { keyId: string; keySecret: string } | null {
  const keyId =
    process.env.RAZORPAY_ROUTE_KEY_ID?.trim() ||
    process.env.INDOBASE_PAYMENTS_RAZORPAY_KEY_ID?.trim() ||
    ''
  const keySecret =
    process.env.RAZORPAY_ROUTE_KEY_SECRET?.trim() ||
    process.env.INDOBASE_PAYMENTS_RAZORPAY_KEY_SECRET?.trim() ||
    ''
  if (!keyId || !keySecret) return null
  return { keyId, keySecret }
}

function razorpayRouteKeysConfigured(): boolean {
  return razorpayRouteCredentials() != null
}

export function razorpayRouteConfigured(): boolean {
  return razorpayRouteKeysConfigured()
}

/** Map Studio KYC business_type → Razorpay Route business_type (docs appendix). */
export function mapRazorpayRouteBusinessType(raw: string | null | undefined): string {
  const value = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set([
    'proprietorship',
    'partnership',
    'private_limited',
    'public_limited',
    'llp',
    'trust',
    'society',
    'ngo',
    'not_yet_registered',
    'educational_institutes',
    'other',
  ])
  if (allowed.has(value)) return value
  if (value === 'sole_proprietorship' || value === 'individual') return 'proprietorship'
  if (value === 'pvt_ltd' || value === 'private') return 'private_limited'
  if (value === 'ltd' || value === 'public') return 'public_limited'
  return 'proprietorship'
}

function digitsPhone(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/**
 * Live Route Linked Account HTTP — official docs:
 * https://razorpay.com/docs/api/payments/route/create-linked-account/
 */
async function razorpayRouteFetchJson({
  method,
  path,
  body,
}: {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: Record<string, unknown>
}): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  const creds = razorpayRouteCredentials()
  if (!creds) {
    return { ok: false, status: 0, json: null, text: 'missing credentials' }
  }
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'IndobaseStudio/RazorpayRoute',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json, text }
}

/**
 * International cards — Stripe Checkout / Connect per official docs.
 * Customer pay: https://docs.stripe.com/api/checkout/sessions/create
 * Merchant onboard: https://docs.stripe.com/connect/hosted-onboarding (Account Links)
 * Studio KYC gates go-live; live Account Link minting is via Indobase Payments Stripe connector.
 */
export class StripeSettlementOnboardingProvider implements MerchantOnboardingProvider {
  async createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult> {
    const link = await createStripeConnectOnboardingLink({
      projectRef: input.projectRef,
      email: input.contactEmail,
      country: 'US',
    })

    return {
      accountId: link.accountId,
      status: 'pending',
      provider: 'stripe',
      stubbed: link.stubbed,
      message: link.onboardingUrl
        ? `${link.message} Onboarding URL minted — open it to finish Stripe hosted KYC, then Confirm go-live.`
        : `${link.message} Confirm go-live in Studio after Checkout Sessions + webhook setup in Indobase Payments.`,
      meta: {
        ...link.meta,
        settlement_adapter: 'stripe',
        settlement_market: 'international',
        onboarding_url: link.onboardingUrl,
        docs_checkout: 'https://docs.stripe.com/api/checkout/sessions/create',
        business_legal_name: input.businessLegalName,
        bank_last4: input.bankAccountLast4,
        created_at: new Date().toISOString(),
      },
    }
  }

  async syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult> {
    if (accountId.startsWith('acct_')) {
      const link = await createStripeConnectOnboardingLink({
        projectRef: 'sync',
        email: null,
        existingAccountId: accountId,
      })
      return {
        accountId,
        status: 'pending',
        provider: 'stripe',
        stubbed: link.stubbed,
        message: link.message,
        meta: {
          synced_at: new Date().toISOString(),
          ...link.meta,
          settlement_adapter: 'stripe',
          settlement_market: 'international',
        },
      }
    }

    return {
      accountId,
      status: 'pending',
      provider: 'stripe',
      stubbed: false,
      message:
        'International card status: Studio go-live + Indobase Payments Stripe connector (charges_enabled / Checkout Session webhooks).',
      meta: {
        synced_at: new Date().toISOString(),
        settlement_adapter: 'stripe',
        settlement_market: 'international',
        docs: 'https://docs.stripe.com/checkout/quickstart',
      },
    }
  }
}

/**
 * India settlements via Razorpay Route Linked Accounts.
 * Official create: POST /v2/accounts (type=route)
 * https://razorpay.com/docs/api/payments/route/create-linked-account/
 * Integration steps: https://razorpay.com/docs/payments/route/integration-guide/
 */
export class RazorpayRouteOnboardingProvider implements MerchantOnboardingProvider {
  async createOrUpdateLinkedAccount(
    input: AggregatorLinkedAccountInput
  ): Promise<AggregatorLinkedAccountResult> {
    const keysPresent = razorpayRouteKeysConfigured()
    const stubId = `acc_stub_${input.projectRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
    const email = (input.contactEmail || '').trim()
    const phone = digitsPhone(input.contactPhone)
    const legalName = (input.businessLegalName || '').trim()

    if (!keysPresent) {
      return {
        accountId: stubId,
        status: 'stubbed',
        provider: 'razorpay_route',
        stubbed: true,
        message:
          'India settlements selected — configure RAZORPAY_ROUTE_KEY_ID/SECRET to create a live Route Linked Account (Razorpay docs: POST /v2/accounts).',
        meta: {
          keys_present: false,
          docs: 'https://razorpay.com/docs/api/payments/route/create-linked-account/',
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
          created_at: new Date().toISOString(),
        },
      }
    }

    if (!email || !phone || legalName.length < 4) {
      return {
        accountId: stubId,
        status: 'stubbed',
        provider: 'razorpay_route',
        stubbed: true,
        message:
          'India settlement keys present, but Razorpay Route requires email, phone (8–15 digits), and legal_business_name (≥4 chars) before POST /v2/accounts. Complete merchant KYC contact fields, then resubmit.',
        meta: {
          keys_present: true,
          missing: {
            email: !email,
            phone: !phone,
            legal_business_name: legalName.length < 4,
          },
          docs: 'https://razorpay.com/docs/api/payments/route/create-linked-account/',
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
          created_at: new Date().toISOString(),
        },
      }
    }

    const street1 = (input.businessAddressLine1 || 'Registered address').trim().slice(0, 100)
    const street2 = (input.businessAddressLine2 || '').trim().slice(0, 100)
    const city = (input.businessCity || 'Bengaluru').trim().slice(0, 50)
    const state = (input.businessState || 'KARNATAKA').trim().toUpperCase().slice(0, 50)
    const postal = (input.businessPostalCode || '560001').trim().slice(0, 10)
    const country = (input.businessCountry || 'IN').trim().toUpperCase().slice(0, 2) || 'IN'

    const body: Record<string, unknown> = {
      email,
      phone,
      type: 'route',
      reference_id: input.projectRef.slice(0, 40),
      legal_business_name: legalName.slice(0, 200),
      business_type: mapRazorpayRouteBusinessType(input.businessType),
      contact_name: (input.bankAccountHolderName || legalName).slice(0, 255),
      customer_facing_business_name: legalName.slice(0, 255),
      profile: {
        category: 'others',
        subcategory: 'others',
        addresses: {
          registered: {
            street1,
            street2,
            city,
            state,
            postal_code: postal,
            country,
          },
        },
      },
    }
    if (input.pan || input.gstin) {
      body.legal_info = {
        ...(input.pan ? { pan: input.pan } : {}),
        ...(input.gstin ? { gst: input.gstin } : {}),
      }
    }

    try {
      const res = await razorpayRouteFetchJson({
        method: 'POST',
        path: '/accounts',
        body,
      })
      if (!res.ok || !res.json?.id) {
        const errDesc =
          (res.json?.error as { description?: string } | undefined)?.description ||
          res.text.slice(0, 240) ||
          `HTTP ${res.status}`
        return {
          accountId: stubId,
          status: 'stubbed',
          provider: 'razorpay_route',
          stubbed: true,
          message: `Razorpay Route Linked Account create failed (${errDesc}). See https://razorpay.com/docs/api/payments/route/create-linked-account/`,
          meta: {
            keys_present: true,
            http_status: res.status,
            error: errDesc,
            docs: 'https://razorpay.com/docs/api/payments/route/create-linked-account/',
            settlement_adapter: 'razorpay_route',
            settlement_market: 'india',
            created_at: new Date().toISOString(),
          },
        }
      }

      const accountId = String(res.json.id)
      const statusRaw = String(res.json.status || 'created').toLowerCase()
      const status: AggregatorLinkedAccountResult['status'] =
        statusRaw === 'suspended' ? 'rejected' : 'created'

      // Route guide 1.1.2–1.1.4: stakeholder → request product → update settlements
      // https://razorpay.com/docs/payments/route/integration-guide/
      let stakeholderId: string | null = null
      let stakeholderError: string | null = null
      let productId: string | null = null
      let productError: string | null = null
      let activationStatus: string | null = null
      let settlementsUpdated = false

      try {
        const sthBody: Record<string, unknown> = {
          name: (input.bankAccountHolderName || legalName).slice(0, 255),
          email,
          percentage_ownership: 100,
          relationship: { director: true, executive: true },
          phone: { primary: phone },
        }
        if (input.pan) {
          sthBody.kyc = { pan: input.pan }
        }
        const sth = await razorpayRouteFetchJson({
          method: 'POST',
          path: `/accounts/${encodeURIComponent(accountId)}/stakeholders`,
          body: sthBody,
        })
        if (sth.ok && sth.json?.id) {
          stakeholderId = String(sth.json.id)
        } else {
          stakeholderError =
            (sth.json?.error as { description?: string } | undefined)?.description ||
            `HTTP ${sth.status}`
        }
      } catch (err) {
        stakeholderError = err instanceof Error ? err.message : 'stakeholder create failed'
      }

      // https://razorpay.com/docs/api/payments/route/request-product-config/
      try {
        const prod = await razorpayRouteFetchJson({
          method: 'POST',
          path: `/accounts/${encodeURIComponent(accountId)}/products`,
          body: { product_name: 'route' },
        })
        if (prod.ok && prod.json?.id) {
          productId = String(prod.json.id)
          activationStatus =
            typeof prod.json.activation_status === 'string'
              ? prod.json.activation_status
              : null
        } else {
          productError =
            (prod.json?.error as { description?: string } | undefined)?.description ||
            `HTTP ${prod.status}`
        }
      } catch (err) {
        productError = err instanceof Error ? err.message : 'product request failed'
      }

      // https://razorpay.com/docs/api/payments/route/update-product-config/
      const accountNumber = (input.bankAccountNumber || '').replace(/\s+/g, '')
      const ifsc = (input.bankIfsc || '').trim().toUpperCase()
      const beneficiary = (input.bankAccountHolderName || legalName).trim()
      if (productId && accountNumber.length >= 5 && ifsc && beneficiary) {
        try {
          const upd = await razorpayRouteFetchJson({
            method: 'PATCH',
            path: `/accounts/${encodeURIComponent(accountId)}/products/${encodeURIComponent(productId)}`,
            body: {
              settlements: {
                account_number: accountNumber.slice(0, 35),
                ifsc_code: ifsc,
                beneficiary_name: beneficiary.slice(0, 120),
              },
              tnc_accepted: true,
            },
          })
          if (upd.ok) {
            settlementsUpdated = true
            if (typeof upd.json?.activation_status === 'string') {
              activationStatus = upd.json.activation_status
            }
          } else {
            productError =
              (upd.json?.error as { description?: string } | undefined)?.description ||
              productError ||
              `settlements HTTP ${upd.status}`
          }
        } catch (err) {
          productError =
            err instanceof Error ? err.message : productError || 'settlements update failed'
        }
      }

      const activated =
        (activationStatus || '').toLowerCase() === 'activated' ||
        (activationStatus || '').toLowerCase() === 'active'
      const finalStatus: AggregatorLinkedAccountResult['status'] = activated
        ? 'active'
        : status === 'rejected'
          ? 'rejected'
          : 'pending'

      const parts = [
        'Razorpay Route Linked Account created',
        stakeholderId ? 'stakeholder created' : `stakeholder pending${stakeholderError ? ` (${stakeholderError})` : ''}`,
        productId
          ? settlementsUpdated
            ? 'product config + bank settlements submitted'
            : 'product config requested (bank settlements incomplete)'
          : `product config pending${productError ? ` (${productError})` : ''}`,
        activated
          ? 'activation active — Confirm go-live in Studio'
          : 'complete any Razorpay requirements, then Confirm go-live in Studio',
      ]

      return {
        accountId,
        status: finalStatus,
        provider: 'razorpay_route',
        stubbed: false,
        message: parts.join('. ') + '.',
        meta: {
          keys_present: true,
          razorpay_status: statusRaw,
          stakeholder_id: stakeholderId,
          stakeholder_error: stakeholderError,
          product_id: productId,
          product_error: productError,
          activation_status: activationStatus,
          settlements_updated: settlementsUpdated,
          docs_create: 'https://razorpay.com/docs/api/payments/route/create-linked-account/',
          docs_stakeholder: 'https://razorpay.com/docs/api/payments/route/create-stakeholder/',
          docs_product: 'https://razorpay.com/docs/api/payments/route/request-product-config/',
          docs_settlements: 'https://razorpay.com/docs/api/payments/route/update-product-config/',
          docs_guide: 'https://razorpay.com/docs/payments/route/integration-guide/',
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
          bank_last4: input.bankAccountLast4,
          created_at: new Date().toISOString(),
        },
      }
    } catch (err) {
      return {
        accountId: stubId,
        status: 'stubbed',
        provider: 'razorpay_route',
        stubbed: true,
        message: `Razorpay Route request error: ${err instanceof Error ? err.message : 'unknown'}`,
        meta: {
          keys_present: true,
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
          created_at: new Date().toISOString(),
        },
      }
    }
  }

  async syncLinkedAccountStatus(accountId: string): Promise<AggregatorLinkedAccountResult> {
    if (!razorpayRouteKeysConfigured() || accountId.startsWith('acc_stub_')) {
      return {
        accountId,
        status: 'stubbed',
        provider: 'razorpay_route',
        stubbed: true,
        message: 'No live Route account to sync yet.',
        meta: {
          synced_at: new Date().toISOString(),
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
        },
      }
    }

    try {
      const res = await razorpayRouteFetchJson({
        method: 'GET',
        path: `/accounts/${encodeURIComponent(accountId)}`,
      })
      if (!res.ok || !res.json) {
        return {
          accountId,
          status: 'pending',
          provider: 'razorpay_route',
          stubbed: false,
          message: `Could not fetch Linked Account (${res.status}).`,
          meta: {
            synced_at: new Date().toISOString(),
            http_status: res.status,
            docs: 'https://razorpay.com/docs/api/payments/route/',
            settlement_adapter: 'razorpay_route',
            settlement_market: 'india',
          },
        }
      }
      const statusRaw = String(res.json.status || 'created').toLowerCase()
      const status: AggregatorLinkedAccountResult['status'] =
        statusRaw === 'suspended' ? 'rejected' : statusRaw === 'created' ? 'created' : 'pending'
      return {
        accountId,
        status,
        provider: 'razorpay_route',
        stubbed: false,
        message: `Razorpay Route account status: ${statusRaw}.`,
        meta: {
          synced_at: new Date().toISOString(),
          razorpay_status: statusRaw,
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
        },
      }
    } catch (err) {
      return {
        accountId,
        status: 'pending',
        provider: 'razorpay_route',
        stubbed: false,
        message: err instanceof Error ? err.message : 'Route sync failed',
        meta: {
          synced_at: new Date().toISOString(),
          settlement_adapter: 'razorpay_route',
          settlement_market: 'india',
        },
      }
    }
  }
}

/** @deprecated Use RazorpayRouteOnboardingProvider — alias kept for older tests. */
export class StubRazorpayRouteProvider extends RazorpayRouteOnboardingProvider {}

/**
 * Default merchant path: KYC on Razorpay/Stripe dashboards, paste API keys (BYOK).
 * Set INDOBASE_MERCHANT_PLATFORM_ONBOARDING=true to use Route Linked Accounts / Stripe Connect.
 */
export function isMerchantPlatformOnboardingEnabled(): boolean {
  const raw = (process.env.INDOBASE_MERCHANT_PLATFORM_ONBOARDING || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** BYOK guidance when Studio does not create platform sub-accounts. */
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
  if (!isMerchantPlatformOnboardingEnabled()) {
    return new ByokSettlementOnboardingProvider(adapter)
  }
  return adapter === 'razorpay_route'
    ? new RazorpayRouteOnboardingProvider()
    : new StripeSettlementOnboardingProvider()
}

/** @deprecated Prefer getMerchantOnboardingProvider(adapter) — kept for tests. */
export function __resetMerchantOnboardingProviderForTests() {
  // No singleton cache anymore.
}
