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

  it('parseGuidedBackendIntent detects launch store with place_test_order', () => {
    const parsed = parseGuidedBackendIntent('Launch my apparel store with real backend and inventory')
    assert.ok(parsed)
    assert.equal(parsed.mode, 'ecommerce')
    assert.equal(parsed.place_test_order, true)
  })

  it('parseGuidedBackendIntent detects create admin as ecommerce', () => {
    const parsed = parseGuidedBackendIntent('Create admin dashboard for my shop catalog')
    assert.ok(parsed)
    assert.equal(parsed.mode, 'ecommerce')
    assert.equal(parsed.place_test_order, true)
  })

  it('parseGuidedBackendIntent detects take live with store context', () => {
    const parsed = parseGuidedBackendIntent('Take my store live with backend catalog wired')
    assert.ok(parsed)
    assert.equal(parsed.mode, 'ecommerce')
  })
})
