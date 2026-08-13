import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CHECKOUT_CONNECTION_FAILURE,
  CHECKOUT_ORDER_RECEIVED,
  customerFacingCheckoutMessage,
  isInternalCheckoutCopy,
} from './customer-copy.ts'

describe('customer checkout copy', () => {
  it('hides fetch failed and paymentStatus', () => {
    assert.equal(isInternalCheckoutCopy('fetch failed'), true)
    assert.equal(isInternalCheckoutCopy('paymentStatus: pending'), true)
    assert.equal(
      customerFacingCheckoutMessage({ ok: false, message: 'fetch failed' }),
      CHECKOUT_CONNECTION_FAILURE,
    )
    assert.equal(
      customerFacingCheckoutMessage({ ok: false, code: 'checkout_failed', message: 'ECONNREFUSED' }),
      CHECKOUT_CONNECTION_FAILURE,
    )
    assert.doesNotMatch(CHECKOUT_CONNECTION_FAILURE, /fetch failed|paymentStatus|backend/i)
  })

  it('treats successful pending payment as order received', () => {
    assert.equal(
      customerFacingCheckoutMessage({
        ok: true,
        message: 'Order reserved. Payment session unavailable — connect gateway or retry checkout.',
      }),
      CHECKOUT_ORDER_RECEIVED,
    )
  })
})
