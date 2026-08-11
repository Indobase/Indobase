import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createAppId, physicalCollectionName, buildBrandedBackend } from './managed.ts'

describe('managed backend helpers', () => {
  it('creates stable short app ids', () => {
    const id = createAppId('hello@indobase.in')
    assert.equal(id.length <= 10, true)
    assert.match(id, /^[a-z0-9]+$/)
  })

  it('scopes collection names per app', () => {
    assert.equal(physicalCollectionName('abc123', 'Orders'), 'ib_abc123_orders')
  })

  it('builds branded backend urls without studio paths', () => {
    const backend = buildBrandedBackend({
      publicUrl: 'https://backend.indobase.in',
      appId: 'abc123',
    })
    assert.equal(backend.api_url, 'https://backend.indobase.in')
    assert.equal(backend.project_ref, 'abc123')
    assert.equal(backend.anon_key, 'indobase-backend')
    assert.equal(backend.project_url.includes('studio.'), false)
  })
})
