/**
 * ApplicationContract + ecommerce verifiers + Go Live release gate.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.ts'
import {
  ECOMMERCE_APPLICATION_CONTRACT,
  ECOMMERCE_CONTRACT_VERSION,
  ECOMMERCE_REQUIRED_VERIFIER_IDS,
  assertEcommerceReleaseGate,
  buildReleaseManifest,
  clearReleaseManifestsForTests,
  getReleaseManifest,
  resolveApplicationContract,
  resolveContractAppType,
  runEcommerceStaticVerifiers,
  shouldRunEcommerceReleaseGate,
} from './index.ts'

describe('ApplicationContract resolution', () => {
  it('resolves ecommerce contract from app_type', () => {
    const c = resolveApplicationContract({ app_type: 'shop' })
    assert.ok(c)
    assert.equal(c!.applicationType, 'ecommerce')
    assert.equal(c!.version, ECOMMERCE_CONTRACT_VERSION)
    assert.equal(c!.capabilities.some((x) => x.id === 'checkout_commerce_abi' && x.required), true)
    assert.equal(c!.capabilities.some((x) => x.id === 'payments_byok' && !x.required), true)
  })

  it('infers ecommerce from cart/checkout html when app_type omitted', () => {
    assert.equal(
      resolveContractAppType({
        html: '<button>Add to cart</button><div>product grid checkout</div>',
      }),
      'ecommerce',
    )
    assert.equal(
      shouldRunEcommerceReleaseGate({
        html: '<button>Add to cart</button><div>storefront</div>',
      }),
      true,
    )
  })

  it('does not apply ecommerce contract to landing', () => {
    const c = resolveApplicationContract({
      app_type: 'landing',
      html: '<h1>Hello marketing site</h1>',
    })
    assert.equal(c, null)
    const gate = assertEcommerceReleaseGate({
      app_type: 'landing',
      html: '<h1>Hello marketing site</h1>',
    })
    assert.equal(gate.ok, true)
    assert.equal(gate.applied, false)
  })

  it('exports stable contract identity', () => {
    assert.equal(ECOMMERCE_APPLICATION_CONTRACT.version, 'ecommerce-contract/v1')
  })
})

describe('Ecommerce verifier pack', () => {
  it('passes managed storefront + blueprint locks', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'Gate Shop',
      appId: 'gateapp01',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
      products: [{ id: 'p1', name: 'Tea', slug: 'tea', price: 40, stock: 10 }],
    })
    const results = runEcommerceStaticVerifiers({ html })
    for (const id of ECOMMERCE_REQUIRED_VERIFIER_IDS) {
      const row = results.find((r) => r.id === id)
      assert.ok(row, id)
      assert.equal(row!.ok, true, id)
    }
  })

  it('fails COMMERCE_ABI_BOUND and NO_DIRECT_PB_ORDER_WRITE on bad HTML', () => {
    const html = `<button>Add to cart</button><script>
      window.__INDOBASE_ENV__={};
      fetch('/api/collections/ib_x_orders/records',{method:'POST',body:'{}'})
    </script>`
    const results = runEcommerceStaticVerifiers({ html })
    const abi = results.find((r) => r.id === 'COMMERCE_ABI_BOUND')
    const pb = results.find((r) => r.id === 'NO_DIRECT_PB_ORDER_WRITE')
    assert.equal(abi?.ok, false)
    assert.equal(abi?.code, 'commerce_abi_unbound')
    assert.equal(pb?.ok, false)
    assert.equal(pb?.code, 'forbidden_pb_order_write')
    assert.ok(abi?.repair_hint)
  })

  it('asserts SCHEMA_LOCKS_ORDERS_ADMIN_ONLY and PRODUCTS_PUBLIC_READ_ADMIN_WRITE', () => {
    const results = runEcommerceStaticVerifiers({
      html: buildManagedShopStorefrontHtml({
        brand: 'X',
        appId: 'x',
        publicUrl: 'https://backend.indobase.in',
      }),
    })
    assert.equal(results.find((r) => r.id === 'SCHEMA_LOCKS_ORDERS_ADMIN_ONLY')?.ok, true)
    assert.equal(results.find((r) => r.id === 'PRODUCTS_PUBLIC_READ_ADMIN_WRITE')?.ok, true)
  })
})

describe('Go Live release gate', () => {
  it('blocks publish on bad ecommerce HTML with structured failure graph', () => {
    const html = `<button>checkout</button><script>
      window.__INDOBASE_ENV__={INDOBASE_URL:'https://backend.indobase.in'};
      fetch('/api/collections/ib_x_products/records')
    </script>`
    const gate = assertEcommerceReleaseGate({
      app_type: 'ecommerce',
      projectRef: 'badshop01',
      html,
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) {
      assert.equal(gate.code, 'contract_verifier_failed')
      assert.ok(gate.failure_graph.length >= 1)
      assert.ok(gate.failures.some((f) => f.id === 'COMMERCE_ABI_BOUND'))
      assert.match(gate.message, /Do not invent a live URL/)
      assert.ok(gate.repair_hints.length >= 1)
    }
  })

  it('allows managed storefront through release gate', () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'Pass Shop',
      appId: 'passapp01',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
    })
    const gate = assertEcommerceReleaseGate({
      app_type: 'ecommerce',
      projectRef: 'passapp01',
      html,
    })
    assert.equal(gate.ok, true)
    assert.equal(gate.applied, true)
    assert.equal(gate.contract?.version, ECOMMERCE_CONTRACT_VERSION)
  })

  it('records ReleaseManifest after successful gate', () => {
    clearReleaseManifestsForTests()
    const html = buildManagedShopStorefrontHtml({
      brand: 'Manifest Shop',
      appId: 'manif01',
      publicUrl: 'https://backend.indobase.in',
    })
    const gate = assertEcommerceReleaseGate({
      app_type: 'ecommerce',
      projectRef: 'manif01',
      html,
    })
    assert.equal(gate.ok, true)
    if (!gate.ok) return
    const manifest = buildReleaseManifest({
      projectRef: 'manif01',
      results: gate.results,
      url: 'https://manif01.sites.indobase.in',
      lane: 'static',
      subdomain: 'manif01',
      artifact_ref: 'static:manif01:abc',
    })
    assert.equal(manifest.contractVersion, ECOMMERCE_CONTRACT_VERSION)
    assert.equal(manifest.applicationType, 'ecommerce')
    assert.equal(manifest.url, 'https://manif01.sites.indobase.in')
    assert.ok(manifest.timestamp)
    assert.equal(getReleaseManifest('manif01')?.projectRef, 'manif01')
  })
})
