import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runCustomerTransitionCertification } from './customer-transitions.ts'

describe('V1.1 customer state transitions', () => {
  it('covers refresh/logout/login/claim/isolation as required cert', () => {
    const report = runCustomerTransitionCertification()
    const failed = report.checks.filter((c) => !c.ok)
    assert.equal(failed.length, 0, failed.map((c) => `${c.id}: ${c.detail}`).join('; '))
    assert.equal(report.ok, true)
    assert.ok(report.checks.some((c) => c.id === 'two_browser_isolation' && c.ok))
    assert.ok(report.checks.some((c) => c.id === 'unverified_must_not_claim' && c.ok))
  })
})
