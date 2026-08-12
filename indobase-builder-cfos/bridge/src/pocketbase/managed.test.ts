import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createAppId,
  physicalCollectionName,
  buildBrandedBackend,
  sanitizeAppId,
  mapFieldTypeToPb,
  formatPbError,
  isCollectionNameConflict,
  adminAuthHeader,
  MANAGED_PUBLIC_KEY,
} from './managed.ts'

describe('managed backend helpers', () => {
  it('creates stable hashed app ids for emails', () => {
    const id = createAppId('hello@indobase.in')
    assert.equal(id, createAppId('hello@indobase.in'))
    assert.match(id, /^[a-z][a-z0-9]+$/)
    assert.equal(id.length <= 16, true)
  })

  it('sanitizes workspace refs with hyphens via hash (no separator collisions)', () => {
    const a = sanitizeAppId('draft_my-cool-app')
    const b = sanitizeAppId('draft_my_cool_app')
    assert.match(a, /^[a-z0-9]+$/)
    assert.match(b, /^[a-z0-9]+$/)
    // Separators differ → must not collapse to the same cleaned id.
    assert.notEqual(a, b)
  })

  it('keeps already-alnum project refs stable', () => {
    assert.equal(sanitizeAppId('roshb77a4744fa'), 'roshb77a4744fa')
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

  it('maps field types without substring traps', () => {
    assert.equal(mapFieldTypeToPb('number'), 'number')
    assert.equal(mapFieldTypeToPb('interface'), 'text')
    assert.equal(mapFieldTypeToPb('relation'), 'text')
    assert.equal(mapFieldTypeToPb('email'), 'email')
    assert.equal(mapFieldTypeToPb('bool'), 'bool')
  })

  it('formats PB errors with data payload', () => {
    const msg = formatPbError(
      {
        message: 'Failed to create collection.',
        data: { name: { code: 'validation_collection_name_exists', message: 'must be unique' } },
      },
      'fallback',
    )
    assert.match(msg, /Failed to create collection/)
    assert.match(msg, /validation_collection_name_exists/)
  })

  it('detects collection name conflicts from data.name', () => {
    assert.equal(
      isCollectionNameConflict({
        message: 'Failed to create collection.',
        data: { name: { code: 'validation_collection_name_exists', message: 'Collection name must be unique' } },
      }),
      true,
    )
    assert.equal(isCollectionNameConflict({ message: 'other error' }), false)
  })

  it('normalizes admin auth headers', () => {
    assert.equal(adminAuthHeader('tok'), 'Bearer tok')
    assert.equal(adminAuthHeader('Bearer tok'), 'Bearer tok')
  })
})
