/**
 * V1.2 payment machine — failure-oriented, not gateway integration.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AtomicPaymentGate,
  FAILURE_THEN_SUCCESS_POLICY,
  PAYMENT_APPLICATION_CONTRACT,
  PAYMENT_INVARIANT_IDS,
  applyPaymentEvent,
  compareAndApplyPaymentEvent,
  initialPaymentSnapshot,
  type PaymentSnapshot,
} from './payment-machine.ts'

function reserved(): PaymentSnapshot {
  return applyPaymentEvent(initialPaymentSnapshot(), { type: 'checkout_reserved' }).snapshot
}

function awaiting(): PaymentSnapshot {
  return applyPaymentEvent(reserved(), { type: 'payment_session_started' }).snapshot
}

describe('V1.2 payment contract', () => {
  it('binds PAYMENT-001…007 and keeps V1.2 off the Core v1 contract', () => {
    assert.equal(PAYMENT_APPLICATION_CONTRACT.version, 'ecommerce-contract/v1.2')
    assert.equal(PAYMENT_INVARIANT_IDS.length, 7)
    assert.ok(PAYMENT_APPLICATION_CONTRACT.requiredFlows.includes('success_after_timeout'))
    assert.ok(PAYMENT_APPLICATION_CONTRACT.requiredFlows.includes('duplicate_webhook'))
  })
})

describe('payment success and failure', () => {
  it('PAYMENT-001 first success commits inventory once and lands in paid', () => {
    const first = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'evt_1' })
    assert.equal(first.snapshot.state, 'paid')
    assert.equal(first.effect, 'commit')
    assert.equal(first.snapshot.inventoryCommitted, true)
    const again = applyPaymentEvent(first.snapshot, { type: 'provider_success', providerEventId: 'evt_1' })
    assert.equal(again.effect, 'none')
    assert.equal(again.idempotent, true)
    assert.equal(again.snapshot.inventoryCommitted, true)
  })

  it('PAYMENT-002 failure releases hold and allows retry', () => {
    const failed = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'evt_fail' })
    assert.equal(failed.snapshot.state, 'payment_failed')
    assert.equal(failed.effect, 'release')
    const retry = applyPaymentEvent(failed.snapshot, { type: 'retry_requested' })
    assert.equal(retry.snapshot.state, 'retrying')
    const session = applyPaymentEvent(retry.snapshot, { type: 'payment_session_started' })
    assert.equal(session.snapshot.state, 'payment_pending')
  })
})

describe('duplicate and out-of-order webhooks', () => {
  it('PAYMENT-003 duplicate webhook / double callback is a no-op', () => {
    const paid = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'evt_dup' })
    const dup = applyPaymentEvent(paid.snapshot, { type: 'provider_success', providerEventId: 'evt_dup' })
    const callback = applyPaymentEvent(dup.snapshot, { type: 'provider_success', providerEventId: 'evt_dup' })
    assert.equal(callback.effect, 'none')
    assert.equal(callback.idempotent, true)
    assert.equal(callback.snapshot.state, 'paid')
  })

  it('PAYMENT-004 out-of-order failure after success does not unpay or release', () => {
    const paid = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'evt_ok' })
    const lateFail = applyPaymentEvent(paid.snapshot, { type: 'provider_failure', providerEventId: 'evt_old_fail' })
    assert.equal(lateFail.snapshot.state, 'paid')
    assert.equal(lateFail.effect, 'none')
    assert.equal(lateFail.snapshot.inventoryCommitted, true)
  })
})

describe('expiry, cancel, timeout, abandoned browser', () => {
  it('PAYMENT-005 reservation expiry releases once and stays expired', () => {
    const expired = applyPaymentEvent(awaiting(), { type: 'reservation_expired' })
    assert.equal(expired.snapshot.state, 'expired')
    assert.equal(expired.effect, 'release')
    const again = applyPaymentEvent(expired.snapshot, { type: 'reservation_expired' })
    assert.equal(again.effect, 'none')
    assert.equal(again.snapshot.state, 'expired')
  })

  it('cancel from payment_pending releases and is terminal', () => {
    const cancelled = applyPaymentEvent(awaiting(), { type: 'cancel_requested' })
    assert.equal(cancelled.snapshot.state, 'cancelled')
    assert.equal(cancelled.effect, 'release')
    const paid = applyPaymentEvent(cancelled.snapshot, { type: 'provider_success', providerEventId: 'evt_late' })
    assert.equal(paid.lateSuccessAfterTerminal, true)
    assert.equal(paid.effect, 'none')
    assert.equal(paid.snapshot.state, 'cancelled')
  })

  it('browser close during payment leaves payment_pending until webhook or expiry', () => {
    const open = awaiting()
    assert.equal(open.state, 'payment_pending')
    assert.equal(open.inventoryCommitted, false)
  })

  it('server timeout is a no-op until a real provider event or expiry', () => {
    const open = awaiting()
    const timed = applyPaymentEvent(open, { type: 'timeout' })
    assert.equal(timed.snapshot.state, 'payment_pending')
    assert.equal(timed.effect, 'none')
    const later = applyPaymentEvent(timed.snapshot, { type: 'provider_success', providerEventId: 'evt_after_hang' })
    assert.equal(later.snapshot.state, 'paid')
    assert.equal(later.effect, 'commit')
  })
})

describe('PAYMENT-006 late provider success after timeout', () => {
  it('does not commit inventory or mark paid after expiry', () => {
    const expired = applyPaymentEvent(awaiting(), { type: 'reservation_expired' })
    const late = applyPaymentEvent(expired.snapshot, { type: 'provider_success', providerEventId: 'evt_after_timeout' })
    assert.equal(late.snapshot.state, 'expired')
    assert.equal(late.effect, 'none')
    assert.equal(late.lateSuccessAfterTerminal, true)
    assert.equal(late.snapshot.inventoryCommitted, false)
    const replay = applyPaymentEvent(late.snapshot, { type: 'provider_success', providerEventId: 'evt_after_timeout' })
    assert.equal(replay.idempotent, true)
    assert.equal(replay.effect, 'none')
  })
})

describe('PAYMENT-007 retry success after failure does not double-decrement', () => {
  it('failure released; later success commits at most once', () => {
    const failed = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'evt_f' })
    assert.equal(failed.effect, 'release')
    const retry = applyPaymentEvent(failed.snapshot, { type: 'retry_requested' })
    const session = applyPaymentEvent(retry.snapshot, { type: 'payment_session_started' })
    const paid = applyPaymentEvent(session.snapshot, { type: 'provider_success', providerEventId: 'evt_ok2' })
    assert.equal(paid.snapshot.state, 'paid')
    assert.equal(paid.effect, 'commit')
    const second = applyPaymentEvent(paid.snapshot, { type: 'provider_success', providerEventId: 'evt_ok2' })
    assert.equal(second.effect, 'none')
  })
})

describe('V1.2 adversarial matrix', () => {
  it('success webhook ×2 is one transition', () => {
    const a = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 's' })
    const b = applyPaymentEvent(a.snapshot, { type: 'provider_success', providerEventId: 's' })
    assert.equal(a.applied, true)
    assert.equal(a.effect, 'commit')
    assert.equal(b.applied, false)
    assert.equal(b.reason, 'idempotent')
  })

  it('failure webhook ×2 is one transition', () => {
    const a = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'f' })
    const b = applyPaymentEvent(a.snapshot, { type: 'provider_failure', providerEventId: 'f2' })
    assert.equal(a.snapshot.state, 'payment_failed')
    assert.equal(a.applied, true)
    assert.equal(b.applied, false)
    assert.equal(b.snapshot.state, 'payment_failed')
  })

  it('success → failure remains paid', () => {
    const paid = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'ok' })
    const fail = applyPaymentEvent(paid.snapshot, { type: 'provider_failure', providerEventId: 'nope' })
    assert.equal(fail.snapshot.state, 'paid')
    assert.equal(fail.effect, 'none')
  })

  it(`failure → success is ${FAILURE_THEN_SUCCESS_POLICY}`, () => {
    const failed = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'f' })
    const paid = applyPaymentEvent(failed.snapshot, { type: 'provider_success', providerEventId: 'ok' })
    assert.equal(paid.snapshot.state, 'paid')
    assert.equal(paid.effect, 'commit')
    assert.equal(paid.snapshot.inventoryCommitted, true)
  })

  it('expiry → success is terminal with no stock commit', () => {
    const expired = applyPaymentEvent(awaiting(), { type: 'reservation_expired' })
    const late = applyPaymentEvent(expired.snapshot, { type: 'provider_success', providerEventId: 'late' })
    assert.equal(late.snapshot.state, 'expired')
    assert.equal(late.effect, 'none')
    assert.equal(late.lateSuccessAfterTerminal, true)
  })

  it('success → expiry remains paid', () => {
    const paid = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'ok' })
    const exp = applyPaymentEvent(paid.snapshot, { type: 'reservation_expired' })
    assert.equal(exp.snapshot.state, 'paid')
    assert.equal(exp.effect, 'none')
  })

  it('retry ×2 is one state transition', () => {
    const failed = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'f' })
    const r1 = applyPaymentEvent(failed.snapshot, { type: 'retry_requested' })
    const r2 = applyPaymentEvent(r1.snapshot, { type: 'retry_requested' })
    assert.equal(r1.snapshot.state, 'retrying')
    assert.equal(r1.applied, true)
    assert.equal(r2.applied, false)
    assert.equal(r2.snapshot.state, 'retrying')
  })

  it('webhook before client response eventually paid', () => {
    const reservedOnly = reserved()
    const paid = applyPaymentEvent(reservedOnly, { type: 'provider_success', providerEventId: 'early' })
    assert.equal(paid.snapshot.state, 'paid')
    assert.equal(paid.effect, 'commit')
  })

  it('client retry after timeout is idempotent then same-order paid', () => {
    const open = awaiting()
    const timed = applyPaymentEvent(open, { type: 'timeout' })
    const again = applyPaymentEvent(timed.snapshot, { type: 'timeout' })
    assert.equal(again.snapshot.state, 'payment_pending')
    const paid = applyPaymentEvent(again.snapshot, { type: 'provider_success', providerEventId: 'same-order' })
    assert.equal(paid.snapshot.state, 'paid')
  })

  it('unknown/out-of-order event is rejected without corruption', () => {
    const open = awaiting()
    const bad = applyPaymentEvent(open, { type: 'unknown', name: 'charge.weird' })
    assert.equal(bad.reason, 'rejected')
    assert.equal(bad.snapshot.state, 'payment_pending')
    assert.equal(bad.effect, 'none')
    const stale = compareAndApplyPaymentEvent(open, 'paid', { type: 'reservation_expired' })
    assert.equal(stale.reason, 'stale_state')
    assert.equal(stale.snapshot.state, 'payment_pending')
  })

  it('concurrent success callbacks commit inventory once', async () => {
    const gate = new AtomicPaymentGate(awaiting())
    const [a, b] = await Promise.all([
      gate.apply({ type: 'provider_success', providerEventId: 'c1' }),
      gate.apply({ type: 'provider_success', providerEventId: 'c1' }),
    ])
    const commits = [a, b].filter((t) => t.effect === 'commit')
    assert.equal(commits.length, 1)
    assert.equal(gate.snapshot.state, 'paid')
    assert.equal(gate.snapshot.inventoryCommitted, true)
  })

  it('concurrent expiry + success is a deterministic terminal outcome', async () => {
    const outcomes = new Set<string>()
    for (const order of ['expiry-first', 'success-first'] as const) {
      const gate = new AtomicPaymentGate(awaiting())
      const jobs =
        order === 'expiry-first'
          ? ([
              gate.apply({ type: 'reservation_expired' }),
              gate.apply({ type: 'provider_success', providerEventId: 'race' }),
            ] as const)
          : ([
              gate.apply({ type: 'provider_success', providerEventId: 'race' }),
              gate.apply({ type: 'reservation_expired' }),
            ] as const)
      const results = await Promise.all(jobs)
      const commits = results.filter((t) => t.effect === 'commit').length
      const releases = results.filter((t) => t.effect === 'release').length
      assert.ok(gate.snapshot.state === 'paid' || gate.snapshot.state === 'expired')
      if (gate.snapshot.state === 'paid') {
        assert.equal(commits, 1)
        assert.equal(gate.snapshot.inventoryCommitted, true)
      } else {
        assert.equal(commits, 0)
        assert.equal(gate.snapshot.inventoryCommitted, false)
        assert.equal(releases, 1)
      }
      outcomes.add(`${gate.snapshot.state}:commit=${commits}`)
    }
    assert.ok(outcomes.has('paid:commit=1'))
    assert.ok(outcomes.has('expired:commit=0'))
  })
})
