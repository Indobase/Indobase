import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseGuidedBackendIntent } from './guided-backend-chain.ts'

describe('guided-backend-chain', () => {
  it('parseGuidedBackendIntent detects Add a real backend as generic', () => {
    const parsed = parseGuidedBackendIntent('Add a real backend for my SaaS dashboard')
    assert.ok(parsed)
    assert.equal(parsed.mode, 'generic')
  })

  it('parseGuidedBackendIntent detects ecommerce store path', () => {
    const parsed = parseGuidedBackendIntent('This is an ecommerce store — seed apparel catalog')
    assert.ok(parsed)
    assert.equal(parsed.mode, 'ecommerce')
  })
})
