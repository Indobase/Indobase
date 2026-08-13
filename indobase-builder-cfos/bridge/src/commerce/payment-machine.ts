/**
 * V1.2 Commerce Payment State Machine — contract, not a Razorpay/Stripe integration.
 * Feature-frozen: no refunds/subscriptions/coupons/extra gateways/UI.
 * Validated on single-instance topology — not production-certified.
 * AtomicPaymentGate is in-process only. Distributed authority is CAS (Gate 2).
 *
 * Inventory commit happens at most once. Provider event ids are idempotent.
 * Late provider success after expiry/cancel does not decrement stock.
 */
export const PAYMENT_CONTRACT_VERSION = 'ecommerce-contract/v1.2' as const

export const PAYMENT_STATES = [
  'pending',
  'reserved',
  'payment_pending',
  'paid',
  'payment_failed',
  'retrying',
  'cancelled',
  'expired',
] as const

export type PaymentState = (typeof PAYMENT_STATES)[number]

export const PAYMENT_INVARIANT_IDS = [
  'PAYMENT-001',
  'PAYMENT-002',
  'PAYMENT-003',
  'PAYMENT-004',
  'PAYMENT-005',
  'PAYMENT-006',
  'PAYMENT-007',
] as const

export type PaymentInvariantId = (typeof PAYMENT_INVARIANT_IDS)[number]

export const PAYMENT_APPLICATION_CONTRACT = {
  applicationType: 'ecommerce' as const,
  version: PAYMENT_CONTRACT_VERSION,
  capabilities: [
    {
      id: 'payment_state_machine',
      required: true,
      description: 'Explicit payment states with idempotent transitions.',
    },
    {
      id: 'inventory_commit_once',
      required: true,
      description: 'Stock decrements at most once per order, on first transition to paid.',
    },
    {
      id: 'provider_event_idempotency',
      required: true,
      description: 'Duplicate or replayed provider events do not re-apply effects.',
    },
    {
      id: 'late_success_after_timeout',
      required: true,
      description: 'Provider success after expiry/cancel does not double-charge or double-decrement.',
    },
  ],
  requiredFlows: [
    'payment_success',
    'payment_failure',
    'retry',
    'duplicate_webhook',
    'out_of_order_webhook',
    'reservation_expiry',
    'cancelled_payment',
    'double_callback',
    'browser_closed_during_payment',
    'server_timeout',
    'success_after_timeout',
  ],
} as const

export type InventoryEffect = 'none' | 'commit' | 'release'

export type PaymentEvent =
  | { type: 'checkout_reserved' }
  | { type: 'payment_session_started' }
  | { type: 'provider_success'; providerEventId: string }
  | { type: 'provider_failure'; providerEventId: string }
  | { type: 'retry_requested' }
  | { type: 'cancel_requested' }
  | { type: 'reservation_expired' }
  | { type: 'timeout' }
  | { type: 'unknown'; name?: string }

export type PaymentSnapshot = {
  state: PaymentState
  revision: number
  inventoryCommitted: boolean
  inventoryReleased: boolean
  seenProviderEventIds: string[]
}

export type PaymentTransition = {
  snapshot: PaymentSnapshot
  effect: InventoryEffect
  idempotent: boolean
  lateSuccessAfterTerminal: boolean
  applied: boolean
  reason: 'applied' | 'idempotent' | 'stale_state' | 'rejected'
}

/**
 * payment_failed + later provider_success (same order, no new checkout):
 * become paid and commit once. Never duplicate the order.
 */
export const FAILURE_THEN_SUCCESS_POLICY = 'same_order_paid_commit_once' as const

const TERMINAL: ReadonlySet<PaymentState> = new Set(['paid', 'cancelled', 'expired'])

export function initialPaymentSnapshot(): PaymentSnapshot {
  return {
    state: 'pending',
    revision: 0,
    inventoryCommitted: false,
    inventoryReleased: false,
    seenProviderEventIds: [],
  }
}

function bump(snap: PaymentSnapshot, patch: Partial<PaymentSnapshot>): PaymentSnapshot {
  return { ...snap, ...patch, revision: snap.revision + 1 }
}

function noop(
  snap: PaymentSnapshot,
  reason: PaymentTransition['reason'],
  extra?: Partial<PaymentTransition>,
): PaymentTransition {
  return {
    snapshot: snap,
    effect: 'none',
    idempotent: reason === 'idempotent' || reason === 'stale_state',
    lateSuccessAfterTerminal: false,
    applied: false,
    reason,
    ...extra,
  }
}

function rememberEvent(snap: PaymentSnapshot, eventId?: string): PaymentSnapshot {
  if (!eventId) return snap
  if (snap.seenProviderEventIds.includes(eventId)) return snap
  return { ...snap, seenProviderEventIds: [...snap.seenProviderEventIds, eventId] }
}

function withState(snap: PaymentSnapshot, state: PaymentState, eventId?: string): PaymentSnapshot {
  return rememberEvent({ ...snap, state }, eventId)
}

export function applyPaymentEvent(snap: PaymentSnapshot, event: PaymentEvent): PaymentTransition {
  const eventId =
    event.type === 'provider_success' || event.type === 'provider_failure' ? event.providerEventId : undefined

  if (event.type === 'unknown') {
    return noop(rememberEvent(snap, eventId), 'rejected')
  }

  if (eventId && snap.seenProviderEventIds.includes(eventId)) {
    return noop(snap, 'idempotent')
  }

  if (snap.state === 'paid') {
    return noop(rememberEvent(snap, eventId), 'idempotent')
  }

  if (
    (snap.state === 'expired' || snap.state === 'cancelled') &&
    event.type === 'provider_success'
  ) {
    return {
      snapshot: rememberEvent(snap, eventId),
      effect: 'none',
      idempotent: true,
      lateSuccessAfterTerminal: true,
      applied: false,
      reason: 'idempotent',
    }
  }

  if (TERMINAL.has(snap.state) && event.type !== 'provider_success') {
    return noop(rememberEvent(snap, eventId), 'idempotent')
  }

  switch (event.type) {
    case 'checkout_reserved':
      if (snap.state === 'pending' || snap.state === 'reserved') {
        const idempotent = snap.state === 'reserved'
        return {
          snapshot: idempotent ? snap : bump(withState(snap, 'reserved'), {}),
          effect: 'none',
          idempotent,
          lateSuccessAfterTerminal: false,
          applied: !idempotent,
          reason: idempotent ? 'idempotent' : 'applied',
        }
      }
      break
    case 'payment_session_started':
      if (snap.state === 'reserved' || snap.state === 'retrying' || snap.state === 'payment_pending') {
        const idempotent = snap.state === 'payment_pending'
        return {
          snapshot: idempotent ? snap : bump(withState(snap, 'payment_pending'), {}),
          effect: 'none',
          idempotent,
          lateSuccessAfterTerminal: false,
          applied: !idempotent,
          reason: idempotent ? 'idempotent' : 'applied',
        }
      }
      break
    case 'provider_success': {
      if (
        snap.state === 'reserved' ||
        snap.state === 'payment_pending' ||
        snap.state === 'retrying' ||
        snap.state === 'payment_failed' ||
        snap.state === 'pending'
      ) {
        const commit = !snap.inventoryCommitted
        return {
          snapshot: bump(rememberEvent(snap, eventId), {
            state: 'paid',
            inventoryCommitted: true,
          }),
          effect: commit ? 'commit' : 'none',
          idempotent: !commit,
          lateSuccessAfterTerminal: false,
          applied: commit,
          reason: commit ? 'applied' : 'idempotent',
        }
      }
      break
    }
    case 'provider_failure':
      if (snap.state === 'reserved' || snap.state === 'payment_pending' || snap.state === 'retrying') {
        const release = !snap.inventoryCommitted && !snap.inventoryReleased
        return {
          snapshot: bump(rememberEvent(snap, eventId), {
            state: 'payment_failed',
            inventoryReleased: snap.inventoryReleased || release,
          }),
          effect: release ? 'release' : 'none',
          idempotent: false,
          lateSuccessAfterTerminal: false,
          applied: true,
          reason: 'applied',
        }
      }
      if (snap.state === 'payment_failed') {
        return noop(rememberEvent(snap, eventId), 'idempotent')
      }
      break
    case 'retry_requested':
      if (snap.state === 'payment_failed') {
        return {
          snapshot: bump(withState(snap, 'retrying'), {}),
          effect: 'none',
          idempotent: false,
          lateSuccessAfterTerminal: false,
          applied: true,
          reason: 'applied',
        }
      }
      if (snap.state === 'retrying' || snap.state === 'payment_pending') {
        return noop(snap, 'idempotent')
      }
      break
    case 'cancel_requested':
      if (!TERMINAL.has(snap.state) && snap.state !== 'paid') {
        const release = !snap.inventoryCommitted && !snap.inventoryReleased
        return {
          snapshot: bump(snap, {
            state: 'cancelled',
            inventoryReleased: snap.inventoryReleased || release,
          }),
          effect: release ? 'release' : 'none',
          idempotent: false,
          lateSuccessAfterTerminal: false,
          applied: true,
          reason: 'applied',
        }
      }
      break
    case 'timeout':
      return noop(snap, 'idempotent')
    case 'reservation_expired':
      if (!TERMINAL.has(snap.state)) {
        const release = !snap.inventoryCommitted && !snap.inventoryReleased
        return {
          snapshot: bump(snap, {
            state: 'expired',
            inventoryReleased: snap.inventoryReleased || release,
          }),
          effect: release ? 'release' : 'none',
          idempotent: false,
          lateSuccessAfterTerminal: false,
          applied: true,
          reason: 'applied',
        }
      }
      break
    default:
      break
  }

  return noop(rememberEvent(snap, eventId), 'rejected')
}

/** CAS: refuse to apply if the caller observed a stale state. Persist layer must honor this. */
export function compareAndApplyPaymentEvent(
  snap: PaymentSnapshot,
  expectedState: PaymentState,
  event: PaymentEvent,
): PaymentTransition {
  if (snap.state !== expectedState) {
    return noop(snap, 'stale_state')
  }
  return applyPaymentEvent(snap, event)
}

/** In-process serialization of concurrent workers on one order. */
export class AtomicPaymentGate {
  private chain: Promise<void> = Promise.resolve()
  snapshot: PaymentSnapshot

  constructor(snapshot: PaymentSnapshot = initialPaymentSnapshot()) {
    this.snapshot = snapshot
  }

  apply(event: PaymentEvent): Promise<PaymentTransition> {
    const run = this.chain.then(() => {
      const expected = this.snapshot.state
      const transition = compareAndApplyPaymentEvent(this.snapshot, expected, event)
      if (transition.applied || transition.reason === 'idempotent') {
        this.snapshot = transition.snapshot
      }
      return transition
    })
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

/** Reconstruct a snapshot from persisted order + reservation rows. */
export function snapshotFromRecords(input: {
  paymentStatus?: string | null
  paymentState?: string | null
  reservationStatus?: string | null
  reservationExpired?: boolean
  providerEventId?: string | null
  revision?: number | null
}): PaymentSnapshot {
  const seen = input.providerEventId ? [input.providerEventId] : []
  const explicit = PAYMENT_STATES.includes(input.paymentState as PaymentState)
    ? (input.paymentState as PaymentState)
    : null
  const revision = typeof input.revision === 'number' && input.revision >= 0 ? input.revision : 0
  if (explicit) {
    return {
      state: explicit,
      revision,
      inventoryCommitted: explicit === 'paid' || input.reservationStatus === 'committed',
      inventoryReleased: explicit === 'expired' || explicit === 'cancelled' || input.reservationStatus === 'released',
      seenProviderEventIds: seen,
    }
  }
  if (input.paymentStatus === 'paid') {
    return { state: 'paid', revision, inventoryCommitted: true, inventoryReleased: false, seenProviderEventIds: seen }
  }
  if (input.paymentStatus === 'cancelled') {
    return { state: 'cancelled', revision, inventoryCommitted: false, inventoryReleased: true, seenProviderEventIds: seen }
  }
  if (input.paymentStatus === 'failed') {
    return {
      state: 'payment_failed',
      revision,
      inventoryCommitted: false,
      inventoryReleased: input.reservationStatus === 'released',
      seenProviderEventIds: seen,
    }
  }
  if (input.reservationExpired || input.reservationStatus === 'released') {
    return { state: 'expired', revision, inventoryCommitted: false, inventoryReleased: true, seenProviderEventIds: seen }
  }
  if (input.reservationStatus === 'committed') {
    return { state: 'paid', revision, inventoryCommitted: true, inventoryReleased: false, seenProviderEventIds: seen }
  }
  if (input.reservationStatus === 'reserved') {
    return {
      state: input.paymentStatus === 'pending' ? 'payment_pending' : 'reserved',
      revision,
      inventoryCommitted: false,
      inventoryReleased: false,
      seenProviderEventIds: seen,
    }
  }
  return { ...initialPaymentSnapshot(), seenProviderEventIds: seen, revision }
}
