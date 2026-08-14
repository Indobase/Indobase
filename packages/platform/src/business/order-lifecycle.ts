/**
 * Order payment vs fulfillment are separate dimensions.
 * Do not store “fulfilled” on paymentStatus.
 *
 * Refunds: paid → refunded is not implemented (no refunds API). Reject that jump.
 */

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const FULFILLMENT_STATUSES = ['unfulfilled', 'processing', 'fulfilled', 'cancelled'] as const
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

const PAYMENT_EDGES: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['paid', 'failed'],
  paid: [],
  failed: [],
  refunded: [],
}

const FULFILLMENT_EDGES: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  unfulfilled: ['processing', 'fulfilled', 'cancelled'],
  processing: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value)
}

export function isFulfillmentStatus(value: string): value is FulfillmentStatus {
  return (FULFILLMENT_STATUSES as readonly string[]).includes(value)
}

export function normalizePaymentStatus(raw?: string | null): PaymentStatus {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'paid' || v === 'complete' || v === 'completed') return 'paid'
  if (v === 'failed' || v === 'cancelled' || v === 'canceled') return 'failed'
  if (v === 'refunded') return 'refunded'
  return 'pending'
}

export function normalizeFulfillmentStatus(raw?: string | null): FulfillmentStatus {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'processing' || v === 'in_progress') return 'processing'
  if (v === 'fulfilled' || v === 'shipped' || v === 'delivered') return 'fulfilled'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  return 'unfulfilled'
}

export type TransitionResult =
  | { ok: true; from: string; to: string }
  | { ok: false; code: 'illegal_transition' | 'refunds_not_supported'; message: string; from: string; to: string }

export function applyPaymentTransition(fromRaw: string | null | undefined, to: PaymentStatus): TransitionResult {
  const from = normalizePaymentStatus(fromRaw)
  if (from === to) return { ok: true, from, to }
  if (to === 'refunded') {
    return {
      ok: false,
      code: 'refunds_not_supported',
      message: 'Refunds are not supported yet. paymentStatus stays paid.',
      from,
      to,
    }
  }
  if (!PAYMENT_EDGES[from].includes(to)) {
    return {
      ok: false,
      code: 'illegal_transition',
      message: `Cannot change payment from ${from} to ${to}.`,
      from,
      to,
    }
  }
  return { ok: true, from, to }
}

export function applyFulfillmentTransition(
  fromRaw: string | null | undefined,
  to: FulfillmentStatus,
): TransitionResult {
  const from = normalizeFulfillmentStatus(fromRaw)
  if (from === to) return { ok: true, from, to }
  if (!FULFILLMENT_EDGES[from].includes(to)) {
    return {
      ok: false,
      code: 'illegal_transition',
      message: `Cannot change fulfillment from ${from} to ${to}.`,
      from,
      to,
    }
  }
  return { ok: true, from, to }
}

/** Operator copy: “fulfilled” only when fulfillmentStatus is fulfilled. */
export function operatorFulfillmentCopy(fulfillmentStatus?: string | null): string {
  return normalizeFulfillmentStatus(fulfillmentStatus)
}

export function formatOrderRuntimeLine(input: {
  id: string
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  amount?: string
  who?: string
  items?: string
}): string {
  const payment = normalizePaymentStatus(input.paymentStatus)
  const fulfillment = normalizeFulfillmentStatus(input.fulfillmentStatus)
  return `- #${input.id} payment=${payment} fulfillment=${fulfillment} ${input.amount || ''} ${input.who || ''} ${input.items || ''}`
    .replace(/\s+/g, ' ')
    .trim()
}
