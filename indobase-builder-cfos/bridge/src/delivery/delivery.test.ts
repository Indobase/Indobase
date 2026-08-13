/**
 * ApplicationContract + ecommerce verifiers + Go Live release gate.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.ts'
import {
  ECOMMERCE_APPLICATION_CONTRACT,
  ECOMMERCE_CONTRACT_VERSION,
  ECOMMERCE_FUNCTIONAL_VERIFIER_IDS,
  ECOMMERCE_REQUIRED_VERIFIER_IDS,
  ECOMMERCE_TASK_GRAPH_VERSION,
  ECOMMERCE_TASK_IDS,
  GUIDED_STEP_TO_TASK,
  applyGuidedStepsToTaskGraph,
  applyLaunchGateToTaskGraph,
  assertEcommerceReleaseGate,
  assertEcommerceReleaseGateAsync,
  buildEcommerceTaskGraph,
  buildReleaseManifest,
  clearReleaseManifestsForTests,
  getReleaseManifest,
  getTask,
  markTask,
  resolveApplicationContract,
  resolveContractAppType,
  runEcommerceFunctionalVerifiers,
  runEcommerceStaticVerifiers,
  shouldRunEcommerceReleaseGate,
  summarizeTaskGraph,
  taskGraphDependenciesSatisfied,
  type FunctionalFetch,
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

  it('fails NO_CLIENT_PRICE_AUTHORITY when checkout uses localStorage totals', () => {
    const html = `<script>
      window.indobase={commerce:{checkout:{create:function(){}}}}
      const amountMinor = Number(localStorage.getItem('cart_total'));
    </script>`
    const results = runEcommerceStaticVerifiers({ html })
    const price = results.find((r) => r.id === 'NO_CLIENT_PRICE_AUTHORITY')
    assert.equal(price?.ok, false)
    assert.equal(price?.code, 'client_price_authority')
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

describe('Ecommerce functional verifier pack', () => {
  const product = {
    id: 'prodabc1234567',
    name: 'Tea',
    slug: 'tea',
    priceMinor: 4000,
    currency: 'INR',
    stock: 5,
    imageUrl: '',
    active: true,
  }

  function mockFetchPass(): FunctionalFetch {
    const orders = new Map<string, string>()
    let paidOnce = false
    return async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.includes('/api/os/commerce/products') && method === 'GET') {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/api/os/commerce/checkout') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}')) as {
          idempotencyKey?: string
          items?: Array<{ quantity?: number }>
        }
        const qty = Number(body.items?.[0]?.quantity || 0)
        if (qty > product.stock) {
          return new Response(
            JSON.stringify({ ok: false, code: 'out_of_stock', message: 'Insufficient stock' }),
            { status: 400 },
          )
        }
        const key = body.idempotencyKey || ''
        if (orders.has(key)) {
          return new Response(
            JSON.stringify({
              ok: true,
              orderId: orders.get(key),
              amountMinor: product.priceMinor,
              currency: 'INR',
            }),
            { status: 200 },
          )
        }
        const orderId = `ord${orders.size + 1}abcdefgh`
        orders.set(key, orderId)
        return new Response(
          JSON.stringify({
            ok: true,
            orderId,
            amountMinor: product.priceMinor,
            currency: 'INR',
          }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid') && method === 'POST') {
        if (paidOnce) {
          return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
        }
        paidOnce = true
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/api/collections/') && url.includes('orders') && method === 'POST') {
        return new Response(JSON.stringify({ message: 'Only superusers can perform this action.' }), {
          status: 403,
        })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 })
    }
  }

  it('skips cleanly when not required', async () => {
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'skipref01',
      requireOverride: false,
    })
    assert.equal(results.length, ECOMMERCE_FUNCTIONAL_VERIFIER_IDS.length)
    for (const r of results) {
      assert.equal(r.ok, true)
      assert.match(String(r.actual), /Skipped/)
    }
  })

  it('passes full pack with mocked commerce + PB denial', async () => {
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'funcref01',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn: mockFetchPass(),
    })
    for (const id of ECOMMERCE_FUNCTIONAL_VERIFIER_IDS) {
      const row = results.find((r) => r.id === id)
      assert.ok(row, id)
      assert.equal(row!.ok, true, `${id}: ${row!.actual}`)
    }
  })

  it('fails GUEST_CHECKOUT_OK when checkout returns error', async () => {
    const fetchFn: FunctionalFetch = async (input) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        return new Response(JSON.stringify({ ok: false, code: 'checkout_failed' }), { status: 502 })
      }
      if (url.includes('/api/collections/')) {
        return new Response('{}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'failchk01',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'GUEST_CHECKOUT_OK')?.ok, false)
    assert.equal(results.find((r) => r.id === 'GUEST_CHECKOUT_OK')?.code, 'guest_checkout_failed')
  })

  it('fails FAKE_PRICE_IGNORED when server echoes client amount', async () => {
    const fetchFn: FunctionalFetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        const body = JSON.parse(String(init?.body || '{}')) as { amountMinor?: number }
        // Evil server trusts client amountMinor when present
        const amountMinor =
          typeof body.amountMinor === 'number' ? body.amountMinor : product.priceMinor
        return new Response(
          JSON.stringify({ ok: true, orderId: 'ordfakeprice0001', amountMinor }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid')) {
        return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
      }
      if (url.includes('/api/collections/')) {
        return new Response('{}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'fakep01',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'FAKE_PRICE_IGNORED')?.ok, false)
    assert.equal(results.find((r) => r.id === 'FAKE_PRICE_IGNORED')?.code, 'fake_price_accepted')
  })

  it('fails OUT_OF_STOCK_REJECTED when huge qty succeeds', async () => {
    const fetchFn: FunctionalFetch = async (input) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        return new Response(
          JSON.stringify({ ok: true, orderId: 'ordoos000000001', amountMinor: product.priceMinor }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid')) {
        return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
      }
      if (url.includes('/api/collections/')) {
        return new Response('{}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'oosfail01',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'OUT_OF_STOCK_REJECTED')?.ok, false)
  })

  it('fails IDEMPOTENT_CHECKOUT when second call mints new orderId', async () => {
    let n = 0
    const fetchFn: FunctionalFetch = async (input) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        n += 1
        return new Response(
          JSON.stringify({
            ok: true,
            orderId: `ordnew${n}00000000`,
            amountMinor: product.priceMinor,
          }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid')) {
        return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
      }
      if (url.includes('/api/collections/')) {
        return new Response('{}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'idemfail1',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'IDEMPOTENT_CHECKOUT')?.ok, false)
    assert.equal(results.find((r) => r.id === 'IDEMPOTENT_CHECKOUT')?.code, 'checkout_not_idempotent')
  })

  it('fails MARK_PAID_IDEMPOTENT when second lacks already:true', async () => {
    const fetchFn: FunctionalFetch = async (input) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        return new Response(
          JSON.stringify({ ok: true, orderId: 'ordmarkpaid0001', amountMinor: product.priceMinor }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/api/collections/')) {
        return new Response('{}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'markfail1',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'MARK_PAID_IDEMPOTENT')?.ok, false)
  })

  it('fails DIRECT_PB_ORDER_POST_DENIED when PB allows create', async () => {
    const fetchFn: FunctionalFetch = async (input) => {
      const url = String(input)
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ ok: true, products: [product] }), { status: 200 })
      }
      if (url.includes('/checkout')) {
        return new Response(
          JSON.stringify({ ok: true, orderId: 'ordpbdeny000001', amountMinor: product.priceMinor }),
          { status: 200 },
        )
      }
      if (url.includes('/mark-paid')) {
        return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
      }
      if (url.includes('/api/collections/') && url.includes('orders')) {
        return new Response(JSON.stringify({ id: 'evil' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }
    const results = await runEcommerceFunctionalVerifiers({
      projectRef: 'pbdeny01',
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      requireOverride: true,
      fetchFn,
    })
    assert.equal(results.find((r) => r.id === 'DIRECT_PB_ORDER_POST_DENIED')?.ok, false)
    assert.equal(
      results.find((r) => r.id === 'DIRECT_PB_ORDER_POST_DENIED')?.code,
      'direct_pb_order_write_allowed',
    )
  })

  it('async release gate fails with functional_verifier_failed + failure_graph', async () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'Func Gate',
      appId: 'funcgate1',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
    })
    const gate = await assertEcommerceReleaseGateAsync({
      app_type: 'ecommerce',
      projectRef: 'funcgate1',
      html,
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      functionalRequireOverride: true,
      fetchFn: async (input) => {
        const url = String(input)
        if (url.includes('/products')) {
          return new Response(JSON.stringify({ ok: true, products: [] }), { status: 200 })
        }
        return new Response('{}', { status: 404 })
      },
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) {
      assert.equal(gate.code, 'functional_verifier_failed')
      assert.ok(gate.failure_graph.some((n) => n.id === 'GUEST_CHECKOUT_OK'))
      assert.ok(gate.failure_graph.every((n) => typeof n.repair_hint === 'string' || n.repair_hint === undefined))
      assert.match(gate.message, /Do not invent a live URL/)
    }
  })

  it('async release gate PASS includes functional results in pack for manifest', async () => {
    const html = buildManagedShopStorefrontHtml({
      brand: 'Func Pass',
      appId: 'funcpass1',
      publicUrl: 'https://backend.indobase.in',
      commerceBaseUrl: 'https://builder.indobase.in',
    })
    const gate = await assertEcommerceReleaseGateAsync({
      app_type: 'ecommerce',
      projectRef: 'funcpass1',
      html,
      commerceBaseUrl: 'https://builder.indobase.in',
      pocketBasePublicUrl: 'https://backend.indobase.in',
      functionalRequireOverride: true,
      fetchFn: mockFetchPass(),
    })
    assert.equal(gate.ok, true)
    if (!gate.ok) return
    for (const id of ECOMMERCE_FUNCTIONAL_VERIFIER_IDS) {
      assert.equal(gate.results.find((r) => r.id === id)?.ok, true, id)
    }
    const manifest = buildReleaseManifest({
      projectRef: 'funcpass1',
      results: gate.results,
      url: 'https://funcpass1.sites.indobase.in',
    })
    assert.ok(manifest.verifierResults.some((r) => r.id === 'GUEST_CHECKOUT_OK' && r.ok))
  })
})

describe('Ecommerce task graph v1', () => {
  it('builds ordered graph with expected task ids and dependency order', () => {
    const graph = buildEcommerceTaskGraph()
    assert.equal(graph.version, ECOMMERCE_TASK_GRAPH_VERSION)
    assert.equal(graph.applicationType, 'ecommerce')
    assert.deepEqual(
      graph.tasks.map((t) => t.id),
      [...ECOMMERCE_TASK_IDS],
    )
    assert.equal(taskGraphDependenciesSatisfied(graph), true)
    for (const t of graph.tasks) {
      assert.equal(t.status, 'pending')
    }
    const gate = graph.tasks.find((t) => t.id === 'T_GO_LIVE_GATE')
    assert.ok(gate?.boundVerifierIds?.includes('COMMERCE_ABI_BOUND'))
    assert.ok(gate?.boundVerifierIds?.includes('GUEST_CHECKOUT_OK'))
  })

  it('maps guidedBackend steps onto task ids', () => {
    const graph = applyGuidedStepsToTaskGraph(
      [
        { id: 'ensureDatabase', status: 'ok', message: 'db ready' },
        { id: 'architectureBoilerplate', status: 'ok' },
        { id: 'setupShopCatalog', status: 'ok' },
        { id: 'placeTestShopOrder', status: 'skipped', message: 'soft skip' },
        { id: 'wireProof', status: 'ok' },
      ],
      { hasAdminHtml: true, hasStorefrontHtml: true },
    )
    assert.equal(getTask(graph, 'T_PROVISION_BACKEND')?.status, 'ok')
    assert.equal(getTask(graph, 'T_SCHEMA')?.status, 'ok')
    assert.equal(getTask(graph, 'T_SEED_CATALOG')?.status, 'ok')
    assert.equal(getTask(graph, 'T_PROOF_ORDER')?.status, 'skipped')
    assert.equal(getTask(graph, 'T_STOREFRONT_BIND')?.status, 'ok')
    assert.equal(getTask(graph, 'T_ADMIN')?.status, 'ok')
    assert.equal(getTask(graph, 'T_GO_LIVE_GATE')?.status, 'pending')
    assert.equal(getTask(graph, 'T_PUBLISH')?.status, 'pending')
    const summary = summarizeTaskGraph(graph)
    assert.equal(summary.counts.ok, 5)
    assert.equal(summary.counts.skipped, 1)
    assert.equal(summary.next_pending, 'T_GO_LIVE_GATE')
    assert.equal(GUIDED_STEP_TO_TASK.ensureDatabase, 'T_PROVISION_BACKEND')
    assert.equal(GUIDED_STEP_TO_TASK.launchBusiness, 'T_PUBLISH')
  })

  it('marks T_GO_LIVE_GATE failed with failure_graph on gate fail', () => {
    const base = applyGuidedStepsToTaskGraph([
      { id: 'ensureDatabase', status: 'ok' },
      { id: 'architectureBoilerplate', status: 'ok' },
      { id: 'setupShopCatalog', status: 'ok' },
      { id: 'wireProof', status: 'ok' },
    ])
    const failed = applyLaunchGateToTaskGraph(base, {
      gateApplied: true,
      gateOk: false,
      published: false,
      manifestOk: false,
      message: 'gate failed',
      failure_graph: [
        {
          id: 'COMMERCE_ABI_BOUND',
          code: 'commerce_abi_unbound',
          severity: 'error',
          repair_hint: 'Use window.indobase.commerce',
        },
      ],
    })
    const gateTask = getTask(failed, 'T_GO_LIVE_GATE')
    assert.equal(gateTask?.status, 'failed')
    assert.ok(gateTask?.failure_graph?.some((n) => n.id === 'COMMERCE_ABI_BOUND'))
    assert.equal(getTask(failed, 'T_PUBLISH')?.status, 'pending')
    const summary = summarizeTaskGraph(failed)
    assert.deepEqual(summary.failed_ids, ['T_GO_LIVE_GATE'])
    assert.ok(summary.repair_hints?.some((h) => /commerce/i.test(h)))
  })

  it('marks gate + publish + manifest ok on successful launch path', () => {
    const base = applyGuidedStepsToTaskGraph([
      { id: 'ensureDatabase', status: 'ok' },
      { id: 'setupShopCatalog', status: 'ok' },
      { id: 'managedStorefront', status: 'ok' },
    ])
    const passed = applyLaunchGateToTaskGraph(base, {
      gateApplied: true,
      gateOk: true,
      published: true,
      manifestOk: true,
    })
    assert.equal(getTask(passed, 'T_GO_LIVE_GATE')?.status, 'ok')
    assert.equal(getTask(passed, 'T_PUBLISH')?.status, 'ok')
    assert.equal(getTask(passed, 'T_RELEASE_MANIFEST')?.status, 'ok')
  })

  it('markTask updates status immutably', () => {
    const g0 = buildEcommerceTaskGraph()
    const g1 = markTask(g0, 'T_PROVISION_BACKEND', 'running')
    assert.equal(getTask(g0, 'T_PROVISION_BACKEND')?.status, 'pending')
    assert.equal(getTask(g1, 'T_PROVISION_BACKEND')?.status, 'running')
  })
})
