import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { majorToMinor, minorToMajor, currencyMinorDigits } from './money.ts'
import { pocketBaseDateTime } from './pb-adapter.ts'
import { buildCommerceRuntimeJs } from './runtime.ts'

describe('commerce money', () => {
  it('uses integer minor units', () => {
    assert.equal(majorToMinor(19.99, 'INR'), 1999)
    assert.equal(majorToMinor('40', 'INR'), 4000)
    assert.equal(minorToMajor(129900, 'INR'), 1299)
    assert.equal(currencyMinorDigits('JPY'), 0)
  })
})

describe('PocketBase datetime', () => {
  it('uses space instead of T so expiry filters compare correctly', () => {
    const formatted = pocketBaseDateTime(new Date('2026-08-13T02:53:00.000Z'))
    assert.equal(formatted, '2026-08-13 02:53:00.000Z')
    assert.equal(formatted.includes('T'), false)
    const iso = '2026-08-13T02:53:00.000Z'
    assert.equal(formatted < iso, true, 'space sorts before T — filters must use the same format')
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
    assert.match(js, /collectionsApi/)
    assert.match(js, /checkoutApi/)
    assert.match(js, /\/checkout/)
    assert.match(js, /customer\/otp\/start/)
    assert.match(js, /customer\/orders/)
    assert.match(js, /guestToken\./)
    assert.doesNotMatch(js, /api\/collections/)
    assert.doesNotMatch(js, /PocketBase/)
    assert.match(js, /variantId/)
    assert.match(js, /I couldn't complete the order yet/)
  })
})

describe('commerce operator mutations', () => {
  it('mark-paid handler is not imported as a public storefront ABI', () => {
    const js = buildCommerceRuntimeJs({
      commerceBaseUrl: 'https://builder.indobase.in/api/os/commerce',
      projectRef: 'abc123',
    })
    assert.doesNotMatch(js, /mark-paid/)
    assert.doesNotMatch(js, /markPaid/)
  })
})
