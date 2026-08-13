/**
 * Ecommerce payment certification v1.2 — transition pack, not storefront screens.
 */
import {
  PAYMENT_APPLICATION_CONTRACT,
  PAYMENT_INVARIANT_IDS,
  applyPaymentEvent,
  initialPaymentSnapshot,
} from '../commerce/payment-machine.js'

export const PAYMENT_CERT_VERSION = 'ecommerce-cert/v1.2' as const

export type PaymentCertCheck = { id: string; required: boolean; ok: boolean; detail: string }

function awaiting() {
  return applyPaymentEvent(
    applyPaymentEvent(initialPaymentSnapshot(), { type: 'checkout_reserved' }).snapshot,
    { type: 'payment_session_started' },
  ).snapshot
}

export function certifyPaymentStateMachine(): PaymentCertCheck[] {
  const success = applyPaymentEvent(awaiting(), { type: 'provider_success', providerEventId: 'e1' })
  const dup = applyPaymentEvent(success.snapshot, { type: 'provider_success', providerEventId: 'e1' })
  const failed = applyPaymentEvent(awaiting(), { type: 'provider_failure', providerEventId: 'ef' })
  const expired = applyPaymentEvent(awaiting(), { type: 'reservation_expired' })
  const late = applyPaymentEvent(expired.snapshot, { type: 'provider_success', providerEventId: 'elate' })
  const afterPaid = applyPaymentEvent(success.snapshot, { type: 'provider_failure', providerEventId: 'eold' })

  return [
    {
      id: 'contract',
      required: true,
      ok: PAYMENT_APPLICATION_CONTRACT.version === 'ecommerce-contract/v1.2' && PAYMENT_INVARIANT_IDS.length === 7,
      detail: 'v1.2 payment contract bound',
    },
    {
      id: 'payment_success',
      required: true,
      ok: success.snapshot.state === 'paid' && success.effect === 'commit',
      detail: 'First success commits once',
    },
    {
      id: 'duplicate_webhook',
      required: true,
      ok: dup.idempotent && dup.effect === 'none',
      detail: 'Duplicate provider event is a no-op',
    },
    {
      id: 'payment_failure',
      required: true,
      ok: failed.snapshot.state === 'payment_failed' && failed.effect === 'release',
      detail: 'Failure releases hold',
    },
    {
      id: 'out_of_order_webhook',
      required: true,
      ok: afterPaid.snapshot.state === 'paid' && afterPaid.effect === 'none',
      detail: 'Failure after paid does not unpay',
    },
    {
      id: 'success_after_timeout',
      required: true,
      ok: late.lateSuccessAfterTerminal && late.effect === 'none' && late.snapshot.state === 'expired',
      detail: 'Late success after expiry does not decrement',
    },
  ]
}

export function runPaymentCertification() {
  const checks = certifyPaymentStateMachine()
  return {
    version: PAYMENT_CERT_VERSION,
    certified: checks.every((c) => !c.required || c.ok),
    checks,
  }
}
