/**
 * Ecommerce verifier pack — publish-time pass/fail with structured failure codes.
 * Reuses wire-proof + ecommerce blueprint rule profiles. Live probes are opt-in.
 */

import { getBlueprint } from '../pocketbase/blueprints.js'
import {
  collectLaunchText,
  contentHasClientPriceAuthority,
  contentHasClientStockAuthority,
  contentHasCommerceCheckoutAbi,
  contentHasForbiddenStorefrontCheckout,
} from '../wire-proof.js'
import { runEcommerceFunctionalVerifiers } from './ecommerce-functional-verifiers.js'

export type VerifierSeverity = 'error' | 'warning' | 'info'

export type VerifierResult = {
  id: string
  ok: boolean
  code?: string
  severity: VerifierSeverity
  expected?: string
  actual?: string
  repair_hint?: string
  file?: string
}

export const ECOMMERCE_REQUIRED_VERIFIER_IDS = [
  'COMMERCE_ABI_BOUND',
  'NO_DIRECT_PB_ORDER_WRITE',
  'NO_CLIENT_PRICE_AUTHORITY',
  'NO_CLIENT_STOCK_AUTHORITY',
  'SCHEMA_LOCKS_ORDERS_ADMIN_ONLY',
  'PRODUCTS_PUBLIC_READ_ADMIN_WRITE',
] as const

export type EcommerceRequiredVerifierId = (typeof ECOMMERCE_REQUIRED_VERIFIER_IDS)[number]

/** Optional live probe — skipped unless INDOBASE_ECOMMERCE_CHECKOUT_PROBE=1. */
export const ECOMMERCE_OPTIONAL_VERIFIER_IDS = ['CHECKOUT_PROBE_LIVE'] as const

export type EcommerceVerifierInput = {
  html?: string | null
  files?: Record<string, string> | null
  /** When true, attempt live checkout probe (still soft-fails if backend down). */
  enableLiveProbe?: boolean
  /** Base URL for optional live probe (bridge public origin). */
  commerceBaseUrl?: string | null
  projectRef?: string | null
  /** When true, force functional pack (tests / ops). */
  enableFunctionalVerify?: boolean
  /** Override functional required policy (tests). */
  functionalRequireOverride?: boolean | null
  pocketBasePublicUrl?: string | null
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>
}

function verifyCommerceAbiBound(text: string): VerifierResult {
  const ok = contentHasCommerceCheckoutAbi(text)
  return {
    id: 'COMMERCE_ABI_BOUND',
    ok,
    code: ok ? undefined : 'commerce_abi_unbound',
    severity: 'error',
    expected: 'Storefront binds window.indobase.commerce.checkout or /api/os/commerce/checkout',
    actual: ok ? 'Commerce ABI checkout present' : 'No commerce.checkout binding found',
    repair_hint: ok
      ? undefined
      : 'Publish guidedBackend storefront_html (or call launchBusiness with managed Commerce storefront). Do not invent checkout APIs.',
    file: 'index.html',
  }
}

function verifyNoDirectPbOrderWrite(text: string): VerifierResult {
  const forbidden = contentHasForbiddenStorefrontCheckout(text)
  const ok = !forbidden
  return {
    id: 'NO_DIRECT_PB_ORDER_WRITE',
    ok,
    code: ok ? undefined : 'forbidden_pb_order_write',
    severity: 'error',
    expected: 'No storefront POST to PocketBase orders collections',
    actual: ok
      ? 'No forbidden PocketBase order writes'
      : 'Storefront POSTs /api/collections/…/orders without Commerce ABI',
    repair_hint: ok
      ? undefined
      : 'Remove PocketBase order creates from storefront. Use indobase.commerce.checkout.create only.',
    file: 'index.html',
  }
}

function verifyNoClientPriceAuthority(text: string): VerifierResult {
  const forbidden = contentHasClientPriceAuthority(text)
  const ok = !forbidden
  return {
    id: 'NO_CLIENT_PRICE_AUTHORITY',
    ok,
    code: ok ? undefined : 'client_price_authority',
    severity: 'error',
    expected: 'Checkout prices come from CheckoutService, not localStorage/DOM totals',
    actual: ok
      ? 'No client price authority'
      : 'Storefront treats localStorage/DOM price as checkout authority',
    repair_hint: ok
      ? undefined
      : 'Send only productId + quantity to commerce.checkout.create. Never POST client totals.',
    file: 'index.html',
  }
}

function verifyNoClientStockAuthority(text: string): VerifierResult {
  const forbidden = contentHasClientStockAuthority(text)
  const ok = !forbidden
  return {
    id: 'NO_CLIENT_STOCK_AUTHORITY',
    ok,
    code: ok ? undefined : 'client_stock_authority',
    severity: 'error',
    expected: 'Inventory mutations only via CheckoutService',
    actual: ok
      ? 'No client stock writes'
      : 'Storefront PATCHes PocketBase product stock',
    repair_hint: ok
      ? undefined
      : 'Remove product stock writes from the storefront. CheckoutService reserves stock.',
    file: 'index.html',
  }
}

function verifyOrdersAdminOnly(): VerifierResult {
  const bp = getBlueprint('ecommerce')
  const names = ['orders', 'order_items', 'inventory_reservations'] as const
  const bad = names.filter((name) => {
    const col = bp.collections.find((c) => c.name === name)
    return !col || col.rules !== 'admin_only'
  })
  const ok = bad.length === 0
  return {
    id: 'SCHEMA_LOCKS_ORDERS_ADMIN_ONLY',
    ok,
    code: ok ? undefined : 'orders_not_admin_only',
    severity: 'error',
    expected: 'orders, order_items, inventory_reservations rules = admin_only',
    actual: ok
      ? 'Blueprint locks transactional collections to admin_only'
      : `Non-admin_only: ${bad.join(', ')}`,
    repair_hint: ok
      ? undefined
      : 'Re-apply ecommerce blueprint via guidedBackend / applySchema — transactional collections must stay admin_only.',
  }
}

function verifyProductsPublicReadAdminWrite(): VerifierResult {
  const products = getBlueprint('ecommerce').collections.find((c) => c.name === 'products')
  const ok = products?.rules === 'public_read_admin_write'
  return {
    id: 'PRODUCTS_PUBLIC_READ_ADMIN_WRITE',
    ok,
    code: ok ? undefined : 'products_rules_mismatch',
    severity: 'error',
    expected: 'products rules = public_read_admin_write',
    actual: ok
      ? 'products public_read_admin_write'
      : `products rules = ${products?.rules ?? 'missing'}`,
    repair_hint: ok
      ? undefined
      : 'Re-apply ecommerce blueprint so products stay public-read / admin-write (no client price/stock mutation).',
  }
}

/**
 * Optional live probe — never fails CI when unset/unavailable.
 * When enabled and commerce returns a structured error (not network), ok=true means endpoint alive.
 */
export async function verifyCheckoutProbeLive(input: {
  commerceBaseUrl?: string | null
  projectRef?: string | null
  enabled?: boolean
}): Promise<VerifierResult> {
  const enabled =
    input.enabled === true ||
    process.env.INDOBASE_ECOMMERCE_CHECKOUT_PROBE === '1' ||
    process.env.INDOBASE_ECOMMERCE_CHECKOUT_PROBE === 'true'

  if (!enabled) {
    return {
      id: 'CHECKOUT_PROBE_LIVE',
      ok: true,
      severity: 'info',
      expected: 'Optional live checkout probe',
      actual: 'Skipped (set INDOBASE_ECOMMERCE_CHECKOUT_PROBE=1 to enable)',
    }
  }

  const base = (
    input.commerceBaseUrl ||
    process.env.INDOBASE_BRIDGE_PUBLIC_URL ||
    process.env.BRIDGE_PUBLIC_URL ||
    ''
  ).replace(/\/+$/, '')

  if (!base) {
    return {
      id: 'CHECKOUT_PROBE_LIVE',
      ok: true,
      severity: 'warning',
      expected: 'Commerce checkout endpoint reachable',
      actual: 'Skipped — no commerceBaseUrl configured',
      repair_hint: 'Set INDOBASE_BRIDGE_PUBLIC_URL when enabling live probe.',
    }
  }

  const url = `${base}/api/os/commerce/checkout`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `probe-${Date.now()}`,
      },
      body: JSON.stringify({
        projectRef: input.projectRef || 'probe',
        items: [],
        email: 'probe@indobase.in',
      }),
      signal: AbortSignal.timeout(4000),
    })
    // Any HTTP response (4xx/5xx) means the route is mounted; network failure ≠ CI fail.
    return {
      id: 'CHECKOUT_PROBE_LIVE',
      ok: true,
      severity: 'info',
      expected: 'Commerce checkout route responds',
      actual: `HTTP ${res.status} from ${url}`,
    }
  } catch (err) {
    return {
      id: 'CHECKOUT_PROBE_LIVE',
      ok: true,
      severity: 'warning',
      expected: 'Commerce checkout route responds',
      actual: `Unreachable: ${err instanceof Error ? err.message : String(err)}`,
      repair_hint: 'Live probe skipped soft — managed backend may be offline; required verifiers still gate publish.',
    }
  }
}

/** Pure static + blueprint verifiers (unit-testable, no network). */
export function runEcommerceStaticVerifiers(input: EcommerceVerifierInput): VerifierResult[] {
  const text = collectLaunchText({ html: input.html, files: input.files })
  return [
    verifyCommerceAbiBound(text),
    verifyNoDirectPbOrderWrite(text),
    verifyNoClientPriceAuthority(text),
    verifyNoClientStockAuthority(text),
    verifyOrdersAdminOnly(),
    verifyProductsPublicReadAdminWrite(),
  ]
}

/** Full pack: required static + optional live probe + functional (policy-gated). */
export async function runEcommerceVerifiers(
  input: EcommerceVerifierInput,
): Promise<VerifierResult[]> {
  const staticResults = runEcommerceStaticVerifiers(input)
  const live = await verifyCheckoutProbeLive({
    commerceBaseUrl: input.commerceBaseUrl,
    projectRef: input.projectRef,
    enabled: input.enableLiveProbe,
  })
  const functional = await runEcommerceFunctionalVerifiers({
    projectRef: input.projectRef || '',
    commerceBaseUrl: input.commerceBaseUrl,
    pocketBasePublicUrl: input.pocketBasePublicUrl,
    force: input.enableFunctionalVerify,
    requireOverride: input.functionalRequireOverride,
    fetchFn: input.fetchFn,
  })
  return [...staticResults, live, ...functional]
}

export function requiredVerifiersFailed(results: VerifierResult[]): VerifierResult[] {
  const required = new Set<string>(ECOMMERCE_REQUIRED_VERIFIER_IDS)
  return results.filter((r) => required.has(r.id) && !r.ok)
}
