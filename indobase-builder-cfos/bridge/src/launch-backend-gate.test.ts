import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertLaunchBackendReady,
  blueprintForLaunchAppType,
  normalizeLaunchAppType,
  resolveEffectiveAppType,
} from './launch-backend-gate.ts'
import { assertLaunchWireReady, autoWireLaunchArtifacts } from './wire-proof.ts'
import { rewriteManagedBackendPath } from './indobase-proxy.ts'

describe('launch-backend-gate', () => {
  it('allows landing without backend', () => {
    const gate = assertLaunchBackendReady(null, { app_type: 'landing' })
    assert.equal(gate.ok, true)
  })

  it('blocks saas without backend', () => {
    const gate = assertLaunchBackendReady(null, { app_type: 'saas' })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.code, 'backend_required')
  })

  it('allows saas when backend keys present', () => {
    const gate = assertLaunchBackendReady(
      { api_url: 'https://backend.indobase.in', anon_key: 'public' },
      { app_type: 'saas', skip_wire_proof: true },
    )
    assert.equal(gate.ok, true)
  })

  it('infers ecommerce from cart html when app_type omitted', () => {
    assert.equal(
      resolveEffectiveAppType({
        html: '<button>Add to cart</button><div class="product grid">',
      }),
      'ecommerce',
    )
  })

  it('normalizes b2b to saas and maps blueprint', () => {
    assert.equal(normalizeLaunchAppType('b2b'), 'saas')
    assert.equal(blueprintForLaunchAppType('saas'), 'saas')
    assert.equal(blueprintForLaunchAppType('ecommerce'), 'ecommerce')
    assert.equal(blueprintForLaunchAppType('landing'), null)
  })

  it('rejects localStorage-only wire for data apps', () => {
    const wire = assertLaunchWireReady({
      html: '<script>localStorage.setItem("cart", "[]")</script>',
      requireWire: true,
      backend: {
        api_url: 'https://backend.indobase.in',
        anon_key: 'public',
        auth_url: 'https://backend.indobase.in/api/collections/users',
        rest_url: 'https://backend.indobase.in/api/collections',
        storage_url: 'https://backend.indobase.in/api/files',
        project_ref: 'abc',
        project_name: 'A',
        project_url: 'https://backend.indobase.in',
      },
    })
    assert.equal(wire.ok, false)
    if (!wire.ok) assert.equal(wire.code, 'wire_required')
  })

  it('rejects env-inject-only without records fetch', () => {
    const wire = assertLaunchWireReady({
      html: '<script>window.__INDOBASE_ENV__={"INDOBASE_URL":"https://backend.indobase.in"};localStorage.setItem("cart","[]")</script>',
      requireWire: true,
    })
    assert.equal(wire.ok, false)
    if (!wire.ok) assert.equal(wire.code, 'wire_required')
  })

  it('accepts records API wiring for non-shop apps', () => {
    const wire = assertLaunchWireReady({
      html: '<script>window.__INDOBASE_ENV__={};fetch(window.__INDOBASE_ENV__.INDOBASE_RECORDS_BASE+"/ib_abc_orgs/records")</script>',
      requireWire: true,
    })
    assert.equal(wire.ok, true)
  })

  it('rejects ecommerce storefront that only fetches products records', () => {
    const wire = assertLaunchWireReady({
      html: '<button>Add to cart</button><script>window.__INDOBASE_ENV__={};fetch("/api/collections/ib_abc_products/records")</script>',
      requireWire: true,
    })
    assert.equal(wire.ok, false)
    if (!wire.ok) assert.equal(wire.code, 'wire_required')
  })

  it('rejects PocketBase order POST without Commerce ABI', () => {
    const wire = assertLaunchWireReady({
      html: `<button>checkout</button><script>
        window.__INDOBASE_ENV__={};
        fetch('/api/collections/ib_abc_orders/records',{method:'POST',body:'{}'})
      </script>`,
      requireWire: true,
    })
    assert.equal(wire.ok, false)
    if (!wire.ok) assert.match(wire.message, /commerce/i)
  })

  it('accepts Commerce ABI checkout wiring', () => {
    const wire = assertLaunchWireReady({
      html: `<button>Add to cart</button><script>
        window.__INDOBASE_ENV__={INDOBASE_URL:'https://backend.indobase.in'};
        window.indobase={commerce:{checkout:{create:async()=>({})}}};
        commerce.checkout.create({items:[]});
        fetch('/api/os/commerce/checkout',{method:'POST'})
      </script>`,
      requireWire: true,
    })
    assert.equal(wire.ok, true)
  })

  it('autoWireLaunchArtifacts binds commerce runtime without replacing unique HTML', () => {
    const out = autoWireLaunchArtifacts({
      html: '<html><head></head><body><h1>Cedar Peak editorial</h1><button>Add to cart</button></body></html>',
      backend: {
        api_url: 'https://backend.indobase.in',
        anon_key: 'public',
        project_ref: 'abc',
        project_name: 'A',
        project_url: 'https://backend.indobase.in',
        public_env: {
          INDOBASE_BACKEND_KIND: 'records',
          INDOBASE_COLLECTION_PREFIX: 'ib_abc_',
          INDOBASE_RECORDS_BASE: 'https://backend.indobase.in/api/collections',
          INDOBASE_URL: 'https://backend.indobase.in',
        },
      },
      brand: 'Test Shop',
    })
    assert.equal(out.replaced_storefront, false)
    assert.match(out.html || '', /Cedar Peak editorial/)
    assert.match(out.html || '', /\/api\/os\/commerce\/runtime\.js/)
    assert.doesNotMatch(out.html || '', /--accent:#3B8FD6/)
  })

  it('autoWireLaunchArtifacts injects __INDOBASE_ENV__ into admin html', () => {
    const out = autoWireLaunchArtifacts({
      admin_html: '<html><head></head><body>admin</body></html>',
      backend: {
        api_url: 'https://backend.indobase.in',
        anon_key: 'public',
        project_ref: 'abc',
        project_name: 'A',
        project_url: 'https://backend.indobase.in',
        public_env: {
          INDOBASE_BACKEND_KIND: 'records',
          INDOBASE_COLLECTION_PREFIX: 'ib_abc_',
          INDOBASE_RECORDS_BASE: 'https://backend.indobase.in/api/collections',
        },
      },
      replaceUnwiredStorefront: false,
    })
    // admin-only without live fetch markers stays unwired unless storefront is added
    assert.match(out.admin_html || '', /__INDOBASE_ENV__/)
    assert.match(out.admin_html || '', /ib_abc_/)
  })

  it('rewrites rest/v1 to physical collections', () => {
    assert.equal(
      rewriteManagedBackendPath('/rest/v1/products', 'abc123'),
      '/api/collections/ib_abc123_products/records',
    )
  })
})
