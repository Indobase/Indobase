import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertLaunchBackendReady,
  blueprintForLaunchAppType,
  normalizeLaunchAppType,
} from './launch-backend-gate.ts'

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
      { api_url: 'https://backend.indobase.in', anon_key: 'k' },
      { app_type: 'saas' },
    )
    assert.equal(gate.ok, true)
  })

  it('normalizes b2b to saas and maps blueprint', () => {
    assert.equal(normalizeLaunchAppType('b2b'), 'saas')
    assert.equal(blueprintForLaunchAppType('saas'), 'saas')
    assert.equal(blueprintForLaunchAppType('ecommerce'), 'ecommerce')
    assert.equal(blueprintForLaunchAppType('landing'), null)
  })
})
