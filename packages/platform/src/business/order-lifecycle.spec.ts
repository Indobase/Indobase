import { describe, expect, it } from 'vitest'
import {
  applyFulfillmentTransition,
  applyPaymentTransition,
  formatOrderRuntimeLine,
  normalizeFulfillmentStatus,
  normalizePaymentStatus,
} from './order-lifecycle'

describe('order lifecycle', () => {
  it('allows pending → paid | failed and rejects illegal payment jumps', () => {
    expect(applyPaymentTransition('pending', 'paid').ok).toBe(true)
    expect(applyPaymentTransition('pending', 'failed').ok).toBe(true)
    expect(applyPaymentTransition('paid', 'pending').ok).toBe(false)
    expect(applyPaymentTransition('failed', 'paid').ok).toBe(false)
  })

  it('documents refunds as unsupported instead of writing refunded', () => {
    const result = applyPaymentTransition('paid', 'refunded')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('refunds_not_supported')
  })

  it('allows unfulfilled → processing → fulfilled and cancel from open states', () => {
    expect(applyFulfillmentTransition('unfulfilled', 'processing').ok).toBe(true)
    expect(applyFulfillmentTransition('processing', 'fulfilled').ok).toBe(true)
    expect(applyFulfillmentTransition('unfulfilled', 'fulfilled').ok).toBe(true)
    expect(applyFulfillmentTransition('unfulfilled', 'cancelled').ok).toBe(true)
    expect(applyFulfillmentTransition('processing', 'cancelled').ok).toBe(true)
    expect(applyFulfillmentTransition('fulfilled', 'cancelled').ok).toBe(false)
    expect(applyFulfillmentTransition('cancelled', 'fulfilled').ok).toBe(false)
  })

  it('never treats fulfilled as a payment status', () => {
    expect(normalizePaymentStatus('fulfilled')).toBe('pending')
    expect(normalizeFulfillmentStatus('fulfilled')).toBe('fulfilled')
    expect(normalizeFulfillmentStatus(undefined)).toBe('unfulfilled')
  })

  it('formats operator lines with both dimensions', () => {
    const line = formatOrderRuntimeLine({
      id: 'ord1',
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      amount: '1299',
      who: 'Priya',
    })
    expect(line).toMatch(/payment=paid/)
    expect(line).toMatch(/fulfillment=fulfilled/)
    expect(line).not.toMatch(/payment=fulfilled/)
  })
})
