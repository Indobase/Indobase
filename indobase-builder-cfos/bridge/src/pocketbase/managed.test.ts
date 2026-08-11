import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createAppId,
  physicalCollectionName,
  buildBrandedBackend,
  sanitizeAppId,
  MANAGED_PUBLIC_KEY,
} from './managed.ts'

describe('managed backend helpers', () => {
  it('creates stable hashed app ids for emails', () => {
    const id = createAppId('hello@indobase.in')
    assert.equal(id, createAppId('hello@indobase.in'))
    assert.match(id, /^[a-z][a-z0-9]+$/)
    assert.equal(id.length <= 16, true)
  })

  it('sanitizes workspace refs with hyphens', () => {
    assert.match(sanitizeAppId('draft_my-cool-app'), /^[a-z0-9]+$/)
  })

  it('scopes collection names per app', () => {
    assert.equal(physicalCollectionName('abc123', 'Orders'), 'ib_abc123_orders')
  })

  it('builds branded backend with records ABI', () => {
    const backend = buildBrandedBackend({
      publicUrl: 'https://backend.indobase.in',
      appId: 'abc123',
    })
    assert.equal(backend.api_url, 'https://backend.indobase.in')
    assert.equal(backend.project_ref, 'abc123')
    assert.equal(backend.anon_key, MANAGED_PUBLIC_KEY)
    assert.equal(backend.rest_url, 'https://backend.indobase.in/api/collections')
    assert.equal(backend.auth_url, 'https://backend.indobase.in/api/collections/users')
    assert.equal(backend.public_env?.INDOBASE_BACKEND_KIND, 'records')
    assert.equal(backend.public_env?.INDOBASE_COLLECTION_PREFIX, 'ib_abc123_')
    assert.equal(backend.project_url.includes('studio.'), false)
  })
})
