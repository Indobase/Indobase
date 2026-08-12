import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { majorToMinor, minorToMajor, currencyMinorDigits } from './money.ts'
import { buildCommerceRuntimeJs } from './runtime.ts'

describe('commerce money', () => {
  it('uses integer minor units', () => {
    assert.equal(majorToMinor(19.99, 'INR'), 1999)
    assert.equal(majorToMinor('40', 'INR'), 4000)
    assert.equal(minorToMajor(129900, 'INR'), 1299)
    assert.equal(currencyMinorDigits('JPY'), 0)
  })
})

describe('commerce runtime ABI', () => {
  it('exposes products cart checkout orders without PocketBase paths', () => {
    const js = buildCommerceRuntimeJs({
      commerceBaseUrl: 'https://builder.indobase.in/api/os/commerce',
      projectRef: 'abc123',
    })
    assert.match(js, /window\.indobase\.commerce/)
    assert.match(js, /productsApi/)
    assert.match(js, /checkoutApi/)
    assert.match(js, /\/checkout/)
    assert.doesNotMatch(js, /api\/collections/)
    assert.doesNotMatch(js, /PocketBase/)
  })
})
