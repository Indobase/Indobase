import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runPaymentCertification } from './payment-certification.ts'

describe('Ecommerce payment certification v1.2', () => {
  it('certifies the failure-oriented payment machine', () => {
    const report = runPaymentCertification()
    assert.equal(report.version, 'ecommerce-cert/v1.2')
    assert.equal(report.certified, true)
    assert.ok(report.checks.every((c) => c.ok))
  })
})
