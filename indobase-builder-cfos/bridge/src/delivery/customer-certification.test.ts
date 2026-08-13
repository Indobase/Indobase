import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CUSTOMER_APPLICATION_CONTRACT } from '../commerce/customer-identity.ts'
import { runCustomerCertification } from './customer-certification.ts'
import { ECOMMERCE_CERT_CORPUS } from './ecommerce-cert-corpus.ts'

describe('Ecommerce customer certification v1.1', () => {
  it('certifies all 20 stores on the customer identity loop', () => {
    const report = runCustomerCertification()
    assert.equal(report.version, 'ecommerce-cert/v1.1')
    assert.equal(report.stores, ECOMMERCE_CERT_CORPUS.length)
    assert.equal(report.certified, 20)
    assert.equal(report.failed, 0)
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('cross_customer_isolation'))
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('two_browser_isolation'))
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('verified_email_claim'))
    assert.ok(report.platform.every((c) => !c.required || c.ok))
    assert.ok(report.platform.some((c) => c.id === 'two_browser_isolation' && c.ok))
    assert.ok(report.platform.some((c) => c.id === 'state_transitions' && c.ok))
  })
})
