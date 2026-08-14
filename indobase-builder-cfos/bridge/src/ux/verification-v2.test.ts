import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'

import { productionVerificationPassed, runVerificationEngine, ECOMMERCE_PROOF_CHAIN } from '../../../../packages/platform/src/business/verification-engine.ts'
import { probeEcommerceHttp, probeSaasHttp } from './runtime-probes.ts'
import { inferBusinessSpec } from './business-spec.ts'
import { buildPreviewFiles } from './preview-artifact.ts'

describe('Verification Engine v2 — real HTTP probes', () => {
  it('ecommerce proof chain: catalog → product → cart variant → checkout → order visible', async () => {
    const orders = new Map<string, { id: string; variantId: string }>()
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname.endsWith('/products') && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ok: true,
          products: [{ id: 'garam-masala', name: 'Garam Masala 200g', variants: [{ id: 'garam-masala-v0' }] }],
        }))
        return
      }
      if (url.pathname.endsWith('/checkout') && req.method === 'POST') {
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          let body: { items?: Array<{ variantId?: string }> } = {}
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            body = {}
          }
          const variantId = String(body.items?.[0]?.variantId || '').trim()
          if (!variantId) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, code: 'invalid_product', message: 'variantId required' }))
            return
          }
          const id = 'ord_verify_1'
          orders.set(id, { id, variantId })
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, order: { id } }))
        })
        return
      }
      if (url.pathname.includes('/orders/') && req.method === 'GET') {
        const id = url.pathname.split('/').pop() || ''
        const order = orders.get(id)
        res.writeHead(order ? 200 : 404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: Boolean(order), order }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const base = `http://127.0.0.1:${port}/api/os/commerce`
    try {
      const spec = inferBusinessSpec('create me a ecommerce site for a masala store')
      const html = buildPreviewFiles(spec, 'proj_masala_v2')['index.html'] || ''
      const probes = await probeEcommerceHttp('proj_masala_v2', {
        commerceBaseUrl: base,
        getJson: async (url, init) => {
          const res = await fetch(url, {
            method: init?.method || 'GET',
            headers: init?.headers,
            body: init?.body,
          })
          const text = await res.text()
          return { status: res.status, json: JSON.parse(text), text }
        },
      }, html)
      assert.equal(probes.catalogHttpOk, true)
      assert.equal(probes.productRendered, true)
      assert.equal(probes.cartOk, true)
      assert.equal(probes.checkoutOk, true)
      assert.equal(probes.orderOk, true)
      assert.equal(probes.orderVisible, true)
      const result = runVerificationEngine({
        pack: 'ecommerce',
        projectRef: 'proj_masala_v2',
        httpStatus: 200,
        html,
        expectedArtifactHash: undefined,
        commerceBound: true,
        catalogHttpOk: probes.catalogHttpOk,
        productRendered: probes.productRendered,
        cartOk: probes.cartOk,
        checkoutOk: probes.checkoutOk,
        orderOk: probes.orderOk,
        orderVisible: probes.orderVisible,
      })
      assert.equal(result.passed, true)
      assert.equal(productionVerificationPassed(result), true)
      for (const id of ECOMMERCE_PROOF_CHAIN) {
        assert.equal(result.checks.find((c) => c.id === id)?.status, 'pass', id)
      }
      assert.doesNotMatch(html, /Circuit Nest/)
    } finally {
      server.close()
    }
  })

  it('saas auth/workflow/persistence probes', async () => {
    const store = { n: 0 }
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname.endsWith('/saas/reload')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, n: store.n }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const html =
      '<!DOCTYPE html><html data-ib-project="proj_saas_v2" data-ib-boot="1"><body><h1>TutorDesk</h1><p>dashboard</p><script>window.__INDOBASE_ENV__={INDOBASE_COLLECTION_PREFIX:"ib_"};window.indobase={auth:{verify:function(){return fetch("/api/collections/users/auth-with-otp")}}}</script></body></html>'
    try {
      const probes = await probeSaasHttp('proj_saas_v2', {
        commerceBaseUrl: `http://127.0.0.1:${port}/api/os`,
        getJson: async (url) => {
          const res = await fetch(url)
          const text = await res.text()
          return { status: res.status, json: JSON.parse(text), text }
        },
      }, html)
      assert.equal(probes.authOk, true)
      assert.equal(probes.workflowOk, true)
      assert.equal(probes.persistenceOk, true)
      const result = runVerificationEngine({
        pack: 'saas',
        projectRef: 'proj_saas_v2',
        httpStatus: 200,
        html,
        authOk: probes.authOk,
        workflowOk: probes.workflowOk,
        persistenceOk: probes.persistenceOk,
      })
      assert.equal(productionVerificationPassed(result), true)
    } finally {
      server.close()
    }
  })

  it('landing production gate does not require commerce', () => {
    const spec = inferBusinessSpec('Build a website for my robotics company')
    const html = buildPreviewFiles(spec, 'proj_land_v2')['index.html'] || ''
    const result = runVerificationEngine({
      pack: 'landing',
      projectRef: 'proj_land_v2',
      httpStatus: 200,
      html,
    })
    assert.equal(result.passed, true)
    assert.equal(productionVerificationPassed(result), true)
    assert.equal(result.checks.find((c) => c.id === 'commerce.abi')?.status, 'skip')
  })
})
