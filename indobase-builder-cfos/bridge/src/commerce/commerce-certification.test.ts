/**
 * Commerce Production Certification v1 — platform authority (not agent trust).
 *
 * Layers under test:
 *   3–4 Build/publish validation (wire-proof)
 *   5 Runtime authorization (blueprint rules — admin-only orders/reservations)
 *
 * Live PB adversarial probes (anon POST, cross-tenant) belong in a separate
 * ops runbook against backend.indobase.in once schema is re-applied.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getBlueprint, rulesForProfile, isSecureWriteRules } from '../pocketbase/blueprints.ts'
import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.ts'
import {
  assertLaunchWireReady,
  contentHasForbiddenStorefrontCheckout,
  contentHasCommerceCheckoutAbi,
} from '../wire-proof.ts'
import { majorToMinor } from './money.ts'
import { buildCommerceRuntimeJs } from './runtime.ts'

describe('Commerce certification — runtime authorization (blueprint)', () => {
  it('products are public-read / admin-write (no client price/stock mutation)', () => {
    const products = getBlueprint('ecommerce').collections.find((c) => c.name === 'products')
    assert.ok(products)
    assert.equal(products.rules, 'public_read_admin_write')
    const rules = rulesForProfile(products.rules)
    assert.equal(rules.listRule, '')
    assert.equal(rules.createRule, null)
    assert.equal(rules.updateRule, null)
    assert.equal(rules.deleteRule, null)
  })

  it('orders / reservations deny public and authenticated client creates', () => {
    for (const name of ['orders', 'order_items', 'inventory_reservations'] as const) {
      const col = getBlueprint('ecommerce').collections.find((c) => c.name === name)
      assert.ok(col, name)
      assert.equal(col.rules, 'admin_only')
      const rules = rulesForProfile(col.rules)
      assert.equal(rules.createRule, null)
      assert.equal(rules.updateRule, null)
      assert.equal(rules.listRule, null)
      assert.equal(isSecureWriteRules(rules), true)
    }
  })
})

describe('Commerce certification — publish-time enforcement', () => {
  it('managed storefront binds Commerce ABI and never POSTs PB orders', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'Cert Shop',
      appId: 'certapp01',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
      products: [{ id: 'p1', name: 'Tea', slug: 'tea', price: 40, stock: 10 }],
    })
    assert.equal(contentHasCommerceCheckoutAbi(html), true)
    assert.equal(contentHasForbiddenStorefrontCheckout(html), false)
    assert.doesNotMatch(html, /\/api\/collections\/[^"'\s]*orders[^"'\s]*\/records/)
    const wire = assertLaunchWireReady({ html, requireWire: true })
    assert.equal(wire.ok, true)
  })

  it('rejects storefront that invents PocketBase order creates', () => {
    const html = `<button>Add to cart</button><script>
      window.__INDOBASE_ENV__={};
      fetch('/api/collections/ib_x_orders/records',{method:'POST',body:'{}'})
    </script>`
    assert.equal(contentHasForbiddenStorefrontCheckout(html), true)
    const wire = assertLaunchWireReady({ html, requireWire: true })
    assert.equal(wire.ok, false)
  })

  it('rejects ecommerce that lists products via records but skips commerce.checkout', () => {
    const html = `<button>checkout</button><script>
      window.__INDOBASE_ENV__={INDOBASE_URL:'https://backend.indobase.in'};
      fetch('/api/collections/ib_x_products/records')
    </script>`
    const wire = assertLaunchWireReady({ html, requireWire: true })
    assert.equal(wire.ok, false)
  })
})

describe('Commerce certification — ABI contract', () => {
  it('runtime never exposes PocketBase collections paths', () => {
    const js = buildCommerceRuntimeJs({
      commerceBaseUrl: 'https://builder.indobase.in/api/os/commerce',
      projectRef: 'certapp01',
    })
    assert.match(js, /window\.indobase\.commerce/)
    assert.match(js, /Idempotency-Key/)
    assert.doesNotMatch(js, /\/api\/collections\//)
  })

  it('money authority is integer minor units', () => {
    // Server prices from catalog majors → minors; client cannot submit authoritative total.
    assert.equal(majorToMinor(99.5, 'INR'), 9950)
    assert.equal(majorToMinor('40', 'INR'), 4000)
  })
})
