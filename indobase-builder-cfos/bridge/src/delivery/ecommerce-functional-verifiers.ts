/**
 * Ecommerce functional verifier pack — machine-owned runtime checks against
 * Commerce + managed PocketBase. Clean skip when not required / unavailable.
 *
 * Required when INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY=1 (or true).
 * Always callable via runEcommerceFunctionalVerifiers for tools/tests/smoke
 * (pass force:true). Not auto-required on every Go Live — mutating probes
 * (checkout reservations + mark-paid) would burn customer stock.
 */

import {
  getManagedBackendConfig,
  physicalCollectionName,
  sanitizeAppId,
} from '../pocketbase/managed.js'
import type { VerifierResult } from './ecommerce-verifiers.js'

export const ECOMMERCE_FUNCTIONAL_VERIFIER_IDS = [
  'GUEST_CHECKOUT_OK',
  'FAKE_PRICE_IGNORED',
  'OUT_OF_STOCK_REJECTED',
  'IDEMPOTENT_CHECKOUT',
  'MARK_PAID_IDEMPOTENT',
  'DIRECT_PB_ORDER_POST_DENIED',
] as const

export type EcommerceFunctionalVerifierId = (typeof ECOMMERCE_FUNCTIONAL_VERIFIER_IDS)[number]

export type FunctionalFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type EcommerceFunctionalVerifierInput = {
  projectRef: string
  commerceBaseUrl?: string | null
  pocketBasePublicUrl?: string | null
  /** Inject for unit tests. */
  fetchFn?: FunctionalFetch
  /** Force-run even when policy would skip (tests / ops scripts). */
  force?: boolean
  /** Override required policy (tests). */
  requireOverride?: boolean | null
  timeoutMs?: number
}

type CatalogProduct = {
  id: string
  priceMinor: number
  stock: number
  name: string
  currency: string
}

function skipped(id: EcommerceFunctionalVerifierId, actual: string): VerifierResult {
  return {
    id,
    ok: true,
    severity: 'info',
    expected: 'Functional ecommerce verifier',
    actual,
  }
}

function resolveCommerceBase(input: EcommerceFunctionalVerifierInput): string {
  return (
    input.commerceBaseUrl ||
    process.env.INDOBASE_BRIDGE_PUBLIC_URL ||
    process.env.BRIDGE_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')
}

function resolvePbPublic(input: EcommerceFunctionalVerifierInput): string {
  const fromInput = (input.pocketBasePublicUrl || '').trim()
  if (fromInput) return fromInput.replace(/\/+$/, '')
  const cfg = getManagedBackendConfig()
  return (cfg?.publicUrl || '').replace(/\/+$/, '')
}

/**
 * Functional pack is required when INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY=1/true.
 * Prod default: leave unset/off (burns catalog stock on Go Live). Ops enable via
 * CFOS service env on .249 — see deploy-indobase-builder-cfos-on-vps.sh comment.
 * (or force/requireOverride). Not auto-required on every managed Go Live — checkout
 * + mark-paid mutate stock/reservations; ops/cert runs set the env or call
 * runEcommerceFunctionalVerifiers directly.
 */
export function shouldRequireEcommerceFunctionalVerifiers(input: {
  projectRef?: string | null
  force?: boolean
  requireOverride?: boolean | null
}): boolean {
  if (typeof input.requireOverride === 'boolean') return input.requireOverride
  if (input.force === true) return true
  return (
    process.env.INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY === '1' ||
    process.env.INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY === 'true'
  )
}

async function jsonFetch(
  fetchFn: FunctionalFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: Record<string, unknown>; ok: boolean }> {
  const res = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, body, ok: res.ok }
}

async function listProducts(
  fetchFn: FunctionalFetch,
  commerceBase: string,
  projectRef: string,
  timeoutMs: number,
): Promise<CatalogProduct[]> {
  const url = `${commerceBase}/api/os/commerce/products?projectRef=${encodeURIComponent(projectRef)}`
  const { ok, body } = await jsonFetch(fetchFn, url, { method: 'GET' }, timeoutMs)
  if (!ok || !Array.isArray(body.products)) return []
  return (body.products as Array<Record<string, unknown>>)
    .map((p) => ({
      id: String(p.id || ''),
      priceMinor: Number(p.priceMinor ?? 0),
      stock: Number(p.stock ?? 0),
      name: String(p.name || ''),
      currency: String(p.currency || 'INR'),
    }))
    .filter((p) => p.id)
}

function pickInStock(products: CatalogProduct[]): CatalogProduct | null {
  return products.find((p) => p.stock >= 1) || null
}

async function postCheckout(
  fetchFn: FunctionalFetch,
  commerceBase: string,
  projectRef: string,
  opts: {
    productId: string
    quantity: number
    idempotencyKey: string
    email?: string
    extras?: Record<string, unknown>
  },
  timeoutMs: number,
): Promise<{ status: number; body: Record<string, unknown>; ok: boolean }> {
  const item: Record<string, unknown> = {
    productId: opts.productId,
    quantity: opts.quantity,
    ...(opts.extras || {}),
  }
  return jsonFetch(
    fetchFn,
    `${commerceBase}/api/os/commerce/checkout`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': opts.idempotencyKey,
        'X-Indobase-Project-Ref': projectRef,
      },
      body: JSON.stringify({
        projectRef,
        idempotencyKey: opts.idempotencyKey,
        email: opts.email || `func-verify@${projectRef}.indobase.local`,
        customer: { email: opts.email || `func-verify@${projectRef}.indobase.local` },
        items: [item],
        // Client-supplied fake totals — server must ignore (FAKE_PRICE_IGNORED).
        ...(opts.extras || {}),
      }),
    },
    timeoutMs,
  )
}

/**
 * Run functional verifiers for a project. When not required, returns skipped ok results.
 * Always available for tools/tests (pass force:true or requireOverride:true).
 */
export async function runEcommerceFunctionalVerifiers(
  input: EcommerceFunctionalVerifierInput,
): Promise<VerifierResult[]> {
  const projectRef = sanitizeAppId(input.projectRef || '')
  const required = shouldRequireEcommerceFunctionalVerifiers({
    projectRef,
    force: input.force,
    requireOverride: input.requireOverride,
  })

  if (!projectRef) {
    if (!required) {
      return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) =>
        skipped(id, 'Skipped — no projectRef'),
      )
    }
    return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) => ({
      id,
      ok: false,
      code: 'functional_project_ref_missing',
      severity: 'error' as const,
      expected: 'projectRef for functional ecommerce verifiers',
      actual: 'Missing projectRef',
      repair_hint: 'Pass a valid projectRef / workspace ref before Go Live functional verify.',
    }))
  }

  if (!required && !input.force) {
    return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) =>
      skipped(
        id,
        'Skipped (set INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY=1 to require; or call with force/requireOverride)',
      ),
    )
  }

  const commerceBase = resolveCommerceBase(input)
  const fetchFn = input.fetchFn || fetch
  const timeoutMs = input.timeoutMs ?? 8000

  if (!commerceBase) {
    const msg = required
      ? ({
          ok: false as const,
          code: 'functional_commerce_base_missing',
          severity: 'error' as const,
          expected: 'INDOBASE_BRIDGE_PUBLIC_URL or commerceBaseUrl',
          actual: 'No commerce base URL configured',
          repair_hint: 'Set INDOBASE_BRIDGE_PUBLIC_URL on the bridge so functional verifiers can hit /api/os/commerce.',
        })
      : null
    if (!msg) {
      return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) =>
        skipped(id, 'Skipped — no commerceBaseUrl'),
      )
    }
    return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) => ({ id, ...msg }))
  }

  let products: CatalogProduct[] = []
  try {
    products = await listProducts(fetchFn, commerceBase, projectRef, timeoutMs)
  } catch (err) {
    const actual = `Catalog unreachable: ${err instanceof Error ? err.message : String(err)}`
    if (!required) {
      return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) => skipped(id, actual))
    }
    return ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.map((id) => ({
      id,
      ok: false,
      code: 'functional_catalog_unreachable',
      severity: 'error' as const,
      expected: 'GET /api/os/commerce/products returns catalog',
      actual,
      repair_hint:
        'Ensure managed PocketBase is up and guidedBackend seeded products for this projectRef, then retry launchBusiness.',
    }))
  }

  const product = pickInStock(products)
  const results: VerifierResult[] = []
  const nonce = `fv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // --- GUEST_CHECKOUT_OK ---
  if (!product) {
    results.push({
      id: 'GUEST_CHECKOUT_OK',
      ok: false,
      code: 'functional_no_in_stock_product',
      severity: 'error',
      expected: 'At least one in-stock catalog product',
      actual: products.length ? 'Products exist but none have stock ≥ 1' : 'Empty catalog',
      repair_hint:
        'Seed catalog via guidedBackend / setupShopCatalog with stock ≥ 1, then retry.',
    })
  } else {
    try {
      const checkout = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        {
          productId: product.id,
          quantity: 1,
          idempotencyKey: `${nonce}-guest`,
        },
        timeoutMs,
      )
      const orderId = typeof checkout.body.orderId === 'string' ? checkout.body.orderId : ''
      const amountMinor = Number(checkout.body.amountMinor)
      const ok =
        checkout.ok &&
        checkout.body.ok === true &&
        Boolean(orderId) &&
        Number.isFinite(amountMinor) &&
        amountMinor === product.priceMinor
      results.push({
        id: 'GUEST_CHECKOUT_OK',
        ok,
        code: ok ? undefined : 'guest_checkout_failed',
        severity: 'error',
        expected: `orderId + amountMinor=${product.priceMinor} from catalog`,
        actual: ok
          ? `orderId=${orderId} amountMinor=${amountMinor}`
          : `HTTP ${checkout.status} body=${JSON.stringify(checkout.body).slice(0, 240)}`,
        repair_hint: ok
          ? undefined
          : 'Fix Commerce checkout / catalog pricing; do not invent checkout URLs. Re-run guidedBackend + retry launchBusiness.',
      })
    } catch (err) {
      results.push({
        id: 'GUEST_CHECKOUT_OK',
        ok: false,
        code: 'guest_checkout_error',
        severity: 'error',
        expected: 'POST /api/os/commerce/checkout succeeds',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'Commerce checkout unreachable — check bridge + managed backend, then retry.',
      })
    }
  }

  // --- FAKE_PRICE_IGNORED ---
  // API only accepts productId+qty; client amount/price fields are ignored (N/A documented).
  if (!product) {
    results.push({
      id: 'FAKE_PRICE_IGNORED',
      ok: false,
      code: 'functional_no_in_stock_product',
      severity: 'error',
      expected: 'Server prices from productId+qty only',
      actual: 'Skipped — no in-stock product',
      repair_hint: 'Seed catalog with stock ≥ 1 before functional verify.',
    })
  } else {
    try {
      const fake = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        {
          productId: product.id,
          quantity: 1,
          idempotencyKey: `${nonce}-fake-price`,
          extras: {
            amountMinor: 1,
            amount: 0.01,
            price: 0.01,
            unitPrice: 1,
            total: 0.01,
          },
        },
        timeoutMs,
      )
      const amountMinor = Number(fake.body.amountMinor)
      const ok =
        fake.ok &&
        fake.body.ok === true &&
        Number.isFinite(amountMinor) &&
        amountMinor === product.priceMinor &&
        amountMinor !== 1
      results.push({
        id: 'FAKE_PRICE_IGNORED',
        ok,
        code: ok ? undefined : 'fake_price_accepted',
        severity: 'error',
        expected: `Server amountMinor=${product.priceMinor} (ignore client amount/price; API prices from productId+qty only)`,
        actual: ok
          ? `amountMinor=${amountMinor} (client fake price ignored)`
          : `HTTP ${fake.status} amountMinor=${fake.body.amountMinor}`,
        repair_hint: ok
          ? undefined
          : 'CheckoutService must price from catalog only — never trust client amount/price fields.',
      })
    } catch (err) {
      results.push({
        id: 'FAKE_PRICE_IGNORED',
        ok: false,
        code: 'fake_price_probe_error',
        severity: 'error',
        expected: 'Checkout ignores client price fields',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'Commerce checkout unreachable during FAKE_PRICE_IGNORED probe.',
      })
    }
  }

  // --- OUT_OF_STOCK_REJECTED ---
  if (!product) {
    results.push({
      id: 'OUT_OF_STOCK_REJECTED',
      ok: false,
      code: 'functional_no_in_stock_product',
      severity: 'error',
      expected: 'out_of_stock when quantity >> stock',
      actual: 'Skipped — no product',
      repair_hint: 'Seed catalog before functional verify.',
    })
  } else {
    try {
      const hugeQty = Math.max(product.stock, 1) + 10_000
      const oos = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        {
          productId: product.id,
          quantity: hugeQty,
          idempotencyKey: `${nonce}-oos`,
        },
        timeoutMs,
      )
      const ok =
        !oos.ok &&
        (oos.body.code === 'out_of_stock' ||
          String(oos.body.message || '')
            .toLowerCase()
            .includes('stock'))
      results.push({
        id: 'OUT_OF_STOCK_REJECTED',
        ok,
        code: ok ? undefined : 'out_of_stock_not_rejected',
        severity: 'error',
        expected: `HTTP 4xx with code out_of_stock for qty=${hugeQty}`,
        actual: `HTTP ${oos.status} code=${oos.body.code || 'none'}`,
        repair_hint: ok
          ? undefined
          : 'Checkout must reject quantity above available stock (out_of_stock).',
      })
    } catch (err) {
      results.push({
        id: 'OUT_OF_STOCK_REJECTED',
        ok: false,
        code: 'out_of_stock_probe_error',
        severity: 'error',
        expected: 'out_of_stock rejection',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'Commerce checkout unreachable during OUT_OF_STOCK probe.',
      })
    }
  }

  // --- IDEMPOTENT_CHECKOUT ---
  if (!product) {
    results.push({
      id: 'IDEMPOTENT_CHECKOUT',
      ok: false,
      code: 'functional_no_in_stock_product',
      severity: 'error',
      expected: 'Same idempotencyKey → same orderId',
      actual: 'Skipped — no product',
      repair_hint: 'Seed catalog before functional verify.',
    })
  } else {
    try {
      const key = `${nonce}-idem`
      const a = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        { productId: product.id, quantity: 1, idempotencyKey: key },
        timeoutMs,
      )
      const b = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        { productId: product.id, quantity: 1, idempotencyKey: key },
        timeoutMs,
      )
      const idA = String(a.body.orderId || '')
      const idB = String(b.body.orderId || '')
      const ok = a.ok && b.ok && Boolean(idA) && idA === idB
      results.push({
        id: 'IDEMPOTENT_CHECKOUT',
        ok,
        code: ok ? undefined : 'checkout_not_idempotent',
        severity: 'error',
        expected: 'Identical orderId on idempotencyKey replay',
        actual: ok ? `orderId=${idA}` : `first=${idA || a.status} second=${idB || b.status}`,
        repair_hint: ok
          ? undefined
          : 'Checkout must return the same orderId for a repeated Idempotency-Key.',
      })
    } catch (err) {
      results.push({
        id: 'IDEMPOTENT_CHECKOUT',
        ok: false,
        code: 'idempotent_checkout_error',
        severity: 'error',
        expected: 'Idempotent checkout replay',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'Commerce checkout unreachable during IDEMPOTENT_CHECKOUT.',
      })
    }
  }

  // --- MARK_PAID_IDEMPOTENT ---
  if (!product) {
    results.push({
      id: 'MARK_PAID_IDEMPOTENT',
      ok: false,
      code: 'functional_no_in_stock_product',
      severity: 'error',
      expected: 'mark-paid twice → already:true on second',
      actual: 'Skipped — no product',
      repair_hint: 'Seed catalog before functional verify.',
    })
  } else {
    try {
      const created = await postCheckout(
        fetchFn,
        commerceBase,
        projectRef,
        {
          productId: product.id,
          quantity: 1,
          idempotencyKey: `${nonce}-mark-paid`,
        },
        timeoutMs,
      )
      const orderId = String(created.body.orderId || '')
      if (!created.ok || !orderId) {
        results.push({
          id: 'MARK_PAID_IDEMPOTENT',
          ok: false,
          code: 'mark_paid_setup_failed',
          severity: 'error',
          expected: 'Checkout creates order for mark-paid probe',
          actual: `HTTP ${created.status}`,
          repair_hint: 'Fix guest checkout before mark-paid idempotency can be verified.',
        })
      } else {
        const markUrl = `${commerceBase}/api/os/commerce/orders/${encodeURIComponent(orderId)}/mark-paid`
        const first = await jsonFetch(
          fetchFn,
          markUrl,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'X-Indobase-Project-Ref': projectRef,
            },
            body: JSON.stringify({ projectRef, orderId }),
          },
          timeoutMs,
        )
        const second = await jsonFetch(
          fetchFn,
          markUrl,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'X-Indobase-Project-Ref': projectRef,
            },
            body: JSON.stringify({ projectRef, orderId }),
          },
          timeoutMs,
        )
        const ok =
          first.ok &&
          first.body.ok === true &&
          second.ok &&
          second.body.ok === true &&
          second.body.already === true
        results.push({
          id: 'MARK_PAID_IDEMPOTENT',
          ok,
          code: ok ? undefined : 'mark_paid_not_idempotent',
          severity: 'error',
          expected: 'Second mark-paid returns already:true',
          actual: ok
            ? `orderId=${orderId} already=true`
            : `first=${JSON.stringify(first.body).slice(0, 120)} second=${JSON.stringify(second.body).slice(0, 120)}`,
          repair_hint: ok
            ? undefined
            : 'markOrderPaid must be idempotent (return already:true when payment_status is paid).',
        })
      }
    } catch (err) {
      results.push({
        id: 'MARK_PAID_IDEMPOTENT',
        ok: false,
        code: 'mark_paid_probe_error',
        severity: 'error',
        expected: 'Idempotent mark-paid',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'mark-paid route unreachable — confirm /api/os/commerce/orders/:id/mark-paid.',
      })
    }
  }

  // --- DIRECT_PB_ORDER_POST_DENIED ---
  const pbPublic = resolvePbPublic(input)
  if (!pbPublic) {
    results.push(
      required
        ? {
            id: 'DIRECT_PB_ORDER_POST_DENIED',
            ok: false,
            code: 'functional_pb_public_missing',
            severity: 'error',
            expected: 'Unauthenticated POST to PB orders returns 4xx',
            actual: 'No PocketBase public URL configured',
            repair_hint: 'Set POCKETBASE_PUBLIC_URL so DIRECT_PB_ORDER_POST_DENIED can prove Commerce authority.',
          }
        : skipped('DIRECT_PB_ORDER_POST_DENIED', 'Skipped — no PocketBase public URL'),
    )
  } else {
    try {
      const ordersCol = physicalCollectionName(projectRef, 'orders')
      const url = `${pbPublic}/api/collections/${ordersCol}/records`
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'attacker@example.com',
          total: 1,
          status: 'pending',
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const ok = res.status >= 400 && res.status < 500
      results.push({
        id: 'DIRECT_PB_ORDER_POST_DENIED',
        ok,
        code: ok ? undefined : 'direct_pb_order_write_allowed',
        severity: 'error',
        expected: `Unauthenticated POST ${ordersCol} → 4xx`,
        actual: `HTTP ${res.status}`,
        repair_hint: ok
          ? undefined
          : 'Orders collection must stay admin_only — re-apply ecommerce blueprint; never open public creates.',
      })
    } catch (err) {
      results.push({
        id: 'DIRECT_PB_ORDER_POST_DENIED',
        ok: false,
        code: 'direct_pb_order_probe_error',
        severity: 'error',
        expected: '4xx on unauthenticated PB orders POST',
        actual: err instanceof Error ? err.message : String(err),
        repair_hint: 'PocketBase public URL unreachable during DIRECT_PB_ORDER_POST_DENIED.',
      })
    }
  }

  return results
}

export function requiredFunctionalVerifiersFailed(results: VerifierResult[]): VerifierResult[] {
  const required = new Set<string>(ECOMMERCE_FUNCTIONAL_VERIFIER_IDS)
  return results.filter((r) => required.has(r.id) && !r.ok)
}
