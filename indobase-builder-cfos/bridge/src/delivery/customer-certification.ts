/**
 * Ecommerce Customer Certification v1.1 — identity + ownership.
 * Core v1 store cert stays frozen; this pack is additive.
 */
import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.js'
import {
  CUSTOMER_APPLICATION_CONTRACT,
  CUSTOMER_INVARIANT_IDS,
  CUSTOMER_SECURITY_BACKLOG,
} from '../commerce/customer-identity.js'
import { runCustomerTransitionCertification } from '../commerce/customer-transitions.js'
import { findEcommerceVertical } from '../vertical-catalog.js'
import { ECOMMERCE_CERT_CORPUS, type EcommerceCertStore } from './ecommerce-cert-corpus.js'

export const CUSTOMER_CERT_VERSION = 'ecommerce-cert/v1.1' as const

export type CustomerCertCheck = {
  id: string
  required: boolean
  ok: boolean
  detail: string
}

export type CustomerStoreCert = {
  storeId: string
  certified: boolean
  checks: CustomerCertCheck[]
}

function productsFor(store: EcommerceCertStore) {
  const vertical = findEcommerceVertical(store.verticalId)
  return (vertical?.products || []).map((p, i) => ({
    id: p.slug || `p${i + 1}`,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: Number(p.price) || 0,
    stock: p.stock,
    currency: p.currency,
  }))
}

export function certifyCustomerStorefront(store: EcommerceCertStore): CustomerStoreCert {
  const html = buildManagedShopStorefrontHtml({
    brand: store.brand,
    appId: store.id.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'certapp',
    publicUrl: 'https://backend.indobase.in',
    commerceBaseUrl: 'https://builder.indobase.in',
    products: productsFor(store),
  })
  const checks: CustomerCertCheck[] = [
    { id: 'anonymous_browse', required: true, ok: /id="grid"/.test(html) && /id="search"/.test(html), detail: 'Browse/search without login' },
    { id: 'guest_checkout', required: true, ok: /commerce\.checkout\.create/.test(html) && /Guest checkout/.test(html), detail: 'Guest checkout copy + ABI' },
    { id: 'customer_signup', required: true, ok: /customer\.startOtp/.test(html) && /customer\.verifyOtp/.test(html), detail: 'OTP start/verify in storefront' },
    { id: 'customer_login_session', required: true, ok: /customerToken/.test(html) && /refreshAccountChrome/.test(html), detail: 'Session restore after refresh' },
    { id: 'customer_order_history', required: true, ok: /id="openOrders"/.test(html) && /customer\.orders\.list/.test(html), detail: 'My Orders' },
    { id: 'logout', required: true, ok: /customer\.logout/.test(html) && /id="logoutBtn"/.test(html), detail: 'Logout control' },
    { id: 'account_upgrade_hint', required: true, ok: /Create an account to track your orders/.test(html), detail: 'Guest → account offer' },
    {
      id: 'contract_invariants',
      required: true,
      ok:
        CUSTOMER_INVARIANT_IDS.length === 7 &&
        CUSTOMER_APPLICATION_CONTRACT.version === 'ecommerce-contract/v1.1' &&
        CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('two_browser_isolation') &&
        CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('verified_email_claim'),
      detail: 'CUSTOMER-001…007 + verified claim + two-browser isolation',
    },
  ]
  return {
    storeId: store.id,
    certified: checks.every((c) => !c.required || c.ok),
    checks,
  }
}

export function certifyCustomerPlatform(): CustomerCertCheck[] {
  const transitions = runCustomerTransitionCertification()
  const twoBrowser = transitions.checks.find((c) => c.id === 'two_browser_isolation')
  const claim = transitions.checks.find((c) => c.id === 'unverified_must_not_claim')
  return [
    {
      id: 'state_transitions',
      required: true,
      ok: transitions.ok,
      detail: transitions.ok
        ? 'anonymous → guest → verified registered → owner'
        : transitions.checks
            .filter((c) => !c.ok)
            .map((c) => c.id)
            .join(','),
    },
    {
      id: 'two_browser_isolation',
      required: true,
      ok: Boolean(twoBrowser?.ok),
      detail: twoBrowser?.detail || 'Two-browser isolation missing',
    },
    {
      id: 'verified_email_claim',
      required: true,
      ok: Boolean(claim?.ok),
      detail: claim?.detail || 'CUSTOMER-007 unverified claim guard missing',
    },
    {
      id: 'session_storage_backlog',
      required: false,
      ok: true,
      detail: `Accepted constraint: localStorage JWT (not target). Backlog=${CUSTOMER_SECURITY_BACKLOG.join(',')}`,
    },
  ]
}

export function runCustomerCertification(stores: readonly EcommerceCertStore[] = ECOMMERCE_CERT_CORPUS) {
  const results = stores.map((store) => certifyCustomerStorefront(store))
  const platform = certifyCustomerPlatform()
  const platformOk = platform.every((c) => !c.required || c.ok)
  const storeCertified = results.filter((r) => r.certified).length
  return {
    version: CUSTOMER_CERT_VERSION,
    stores: results.length,
    certified: platformOk ? storeCertified : 0,
    failed: platformOk ? results.filter((r) => !r.certified).length : results.length,
    platform,
    results,
  }
}
