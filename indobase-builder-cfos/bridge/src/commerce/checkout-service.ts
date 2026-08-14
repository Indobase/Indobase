/**
 * CheckoutService — domain orchestration for Indobase Commerce capability.
 * Pipeline: VALIDATE → PRICE → RESERVE → CREATE_ORDER → CREATE_PAYMENT → RETURN
 */
import { isManagedBackendConfigured } from '../pocketbase/managed.js'
import { platformPaymentsWireCheckout, resolvePlatformApiUrl } from '../platform-api-client.js'
import { minorToMajor } from './money.js'
import {
  commitReservationsForOrder,
  createOrderRecord,
  createReservation,
  ensureCommerceSchema,
  findOrderByIdempotencyKey,
  getCommerceProduct,
  getOrderRecord,
  patchOrderPayment,
  releaseExpiredReservations,
  releaseReservationsForOrder,
  reservationIsActive,
  sumActiveReservations,
} from './pb-adapter.js'
import { CHECKOUT_CONNECTION_FAILURE, customerFacingCheckoutMessage } from './customer-copy.js'
import { normalizeCustomerEmail } from './customer-identity.js'
import { resolveCheckoutCustomer } from './customer-service.js'
import { compareAndApplyPaymentEvent, snapshotFromRecords } from './payment-machine.js'
import type {
  CommerceCheckoutError,
  CommerceCheckoutRequest,
  CommerceCheckoutResult,
  PricedLine,
} from './types.js'
import { purchasableUnitPriceMinor } from '../ux/catalog-domain.js'
import {
  applyFulfillmentTransition,
  normalizeFulfillmentStatus,
  normalizePaymentStatus,
  type FulfillmentStatus,
} from '@indobase/platform'

const orderPaymentLocks = new Map<string, Promise<unknown>>()

/** Serializes payment transitions per order in this process. Not a distributed primitive — Gate 2 CAS is. */
async function withOrderPaymentLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  const prev = orderPaymentLocks.get(orderId) || Promise.resolve()
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  orderPaymentLocks.set(
    orderId,
    prev.then(() => gate).catch(() => gate),
  )
  await prev.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
  }
}

const RESERVATION_TTL_MS = 30 * 60 * 1000

function newOrderId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export async function executeCheckout(
  input: CommerceCheckoutRequest,
): Promise<CommerceCheckoutResult | CommerceCheckoutError> {
  if (!isManagedBackendConfigured()) {
    return { ok: false, code: 'backend_unavailable', message: 'Indobase backend is not configured' }
  }

  const projectRef = (input.projectRef || '').trim()
  const idempotencyKey = (input.idempotencyKey || '').trim()
  const email = normalizeCustomerEmail(input.customerSession?.email || input.customer?.email || '')
  const items = Array.isArray(input.items) ? input.items : []

  if (!projectRef || !idempotencyKey || !email || !items.length) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'projectRef, idempotencyKey, customer.email, and items[] are required',
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_request', message: 'Valid customer email required' }
  }

  try {
    await ensureCommerceSchema(projectRef)
    await releaseExpiredReservations(projectRef)

    const existing = await findOrderByIdempotencyKey(projectRef, idempotencyKey)
    if (existing) {
      const amountMinor =
        typeof existing.total === 'number'
          ? Math.round(existing.total * 100)
          : 0
      return {
        ok: true,
        orderId: existing.id,
        paymentRequired: existing.payment_status !== 'paid',
        paymentUrl: existing.payment_url || null,
        amountMinor,
        currency: existing.currency || 'INR',
        paymentStatus:
          existing.payment_status === 'paid'
            ? 'paid'
            : existing.payment_status === 'failed'
              ? 'failed'
              : 'pending',
        reservationExpiresAt: '',
        message: 'Idempotent replay — returning existing checkout',
      }
    }

    const lines: PricedLine[] = []
    let currency = 'INR'

    for (const item of items) {
      const productId = String(item.productId || '').trim()
      const variantId = String(item.variantId || '').trim()
      const quantity = Math.floor(Number(item.quantity || 0))
      if (!productId || quantity < 1) {
        return { ok: false, code: 'invalid_request', message: 'Each item needs productId and quantity ≥ 1' }
      }
      const product = await getCommerceProduct(projectRef, productId)
      if (!product || !product.active) {
        return { ok: false, code: 'invalid_product', message: `Product not found: ${productId}` }
      }
      const variants = product.variants?.length
        ? product.variants
        : [
            {
              id: `${product.id}__default`,
              sku: product.slug || product.id,
              title: 'Default',
              options: {},
              priceMinor: product.priceMinor,
              stock: product.stock,
              default: true,
            },
          ]
      const variant = variantId
        ? variants.find((v) => v.id === variantId)
        : variants.find((v) => v.default) || variants[0]
      if (!variant?.id) {
        return { ok: false, code: 'invalid_product', message: `variantId required for ${product.name}` }
      }
      const unitPrice = purchasableUnitPriceMinor(variant)
      if (unitPrice == null) {
        return { ok: false, code: 'invalid_product', message: `No purchasable price for ${product.name}` }
      }
      const onHand = typeof variant.stock === 'number' ? variant.stock : 0
      currency = product.currency || currency
      const reserved = await sumActiveReservations(projectRef, product.id, variant.id)
      const available = onHand - reserved
      if (available < quantity) {
        return {
          ok: false,
          code: 'out_of_stock',
          message: `Insufficient stock for ${product.name} (available ${Math.max(0, available)})`,
        }
      }
      lines.push({
        productId: product.id,
        variantId: variant.id,
        slug: product.slug,
        name: variant.title && variant.title !== 'Default' ? `${product.name} (${variant.title})` : product.name,
        quantity,
        unitPriceMinor: unitPrice,
        lineTotalMinor: unitPrice * quantity,
        currency: product.currency,
      })
    }

    const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0)
    const shippingMinor = 0
    const taxMinor = 0
    const amountMinor = subtotalMinor + shippingMinor + taxMinor
    const orderId = newOrderId()
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString()

    const owned = await resolveCheckoutCustomer({
      projectRef,
      email,
      name: input.customer.name,
      phone: input.customer.phone,
      session: input.customerSession || null,
      shippingAddress: input.shippingAddress,
    })

    // Create order first so reservations reference a real order id
    await createOrderRecord({
      projectRef,
      orderId,
      email,
      customerName: input.customer.name,
      currency,
      amountMinor,
      subtotalMinor,
      lines,
      idempotencyKey,
      reservationExpiresAt: expiresAt,
      shippingAddress: input.shippingAddress as Record<string, unknown> | undefined,
      customerId: owned.customer.id,
      customerType: owned.customerType,
      guestTokenHash: owned.guestTokenHash,
    })

    for (const line of lines) {
      await createReservation({
        projectRef,
        orderId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        expiresAt,
      })
    }

    let paymentUrl: string | null = null
    let paymentRequired = true
    let message = 'Order created — complete payment to confirm'

    if (resolvePlatformApiUrl()) {
      try {
        const wired = await platformPaymentsWireCheckout({
          gotrueId: `commerce:${projectRef}`,
          email: `commerce@${projectRef}.indobase.local`,
          workspaceRef: projectRef,
          mode: 'one_time',
          planName: lines.map((l) => l.name).slice(0, 3).join(', ') || 'Order',
          price: String(minorToMajor(amountMinor, currency)),
          currency,
          customerEmail: email,
          customerName: input.customer.name || email,
        })
        if (wired.ok && typeof wired.checkout_url === 'string' && wired.checkout_url.startsWith('http')) {
          paymentUrl = wired.checkout_url
          await patchOrderPayment(projectRef, orderId, { payment_url: paymentUrl })
          message = 'Checkout ready — redirect to payment'
        } else if ((wired as { code?: string }).code === 'gateway_not_ready') {
          message =
            'Order reserved. Connect Razorpay/Stripe (Add payments) to collect money — order stays pending until paid or reservation expires.'
        } else {
          message = wired.message || message
        }
      } catch {
        message =
          'Order reserved. Payment session unavailable — connect gateway or retry checkout.'
      }
    } else {
      message =
        'Order reserved (pending payment). Payment provider not configured on this environment.'
    }

    return {
      ok: true,
      orderId,
      paymentRequired,
      paymentUrl,
      amountMinor,
      currency,
      paymentStatus: 'pending',
      reservationExpiresAt: expiresAt,
      message,
      customerId: owned.customer.id,
      customerType: owned.customerType,
      guestToken: owned.guestToken,
    }
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: customerFacingCheckoutMessage({
        ok: false,
        code: 'checkout_failed',
        message: err instanceof Error ? err.message : CHECKOUT_CONNECTION_FAILURE,
      }),
    }
  }
}

function snapshotForOrder(order: Record<string, unknown>) {
  const expiresAt = String(order.reservation_expires_at || '')
  const paid = order.payment_status === 'paid'
  const expired = Boolean(expiresAt) && !paid && !reservationIsActive(expiresAt)
  return snapshotFromRecords({
    paymentStatus: typeof order.payment_status === 'string' ? order.payment_status : null,
    paymentState: typeof order.payment_state === 'string' ? order.payment_state : null,
    reservationExpired: expired,
    reservationStatus: expired ? 'released' : paid ? 'committed' : 'reserved',
    providerEventId: typeof order.provider_event_id === 'string' ? order.provider_event_id : null,
    revision: typeof order.payment_revision === 'number' ? order.payment_revision : 0,
  })
}

/** Mark order paid (webhook / operator) — V1.2 machine; inventory commit at most once. */
export async function markOrderPaid(input: {
  projectRef: string
  orderId: string
  providerEventId?: string
}): Promise<{ ok: true; already?: boolean; lateSuccess?: boolean } | CommerceCheckoutError> {
  if (!isManagedBackendConfigured()) {
    return { ok: false, code: 'backend_unavailable', message: 'Backend unavailable' }
  }
  try {
    return await withOrderPaymentLock(input.orderId, async () => {
      await ensureCommerceSchema(input.projectRef)
      const order = await getOrderRecord(input.projectRef, input.orderId)
      if (!order) {
        return { ok: false, code: 'invalid_request' as const, message: 'Order not found' }
      }
      const eventId = input.providerEventId || `paid:${input.orderId}`
      const observed = snapshotForOrder(order)
      const transition = compareAndApplyPaymentEvent(observed, observed.state, {
        type: 'provider_success',
        providerEventId: eventId,
      })
      if (transition.reason === 'stale_state') {
        return { ok: true as const, already: true }
      }
      if (transition.lateSuccessAfterTerminal) {
        await patchOrderPayment(input.projectRef, input.orderId, {
          provider_event_id: eventId,
          payment_revision: transition.snapshot.revision,
        })
        return { ok: true as const, already: true, lateSuccess: true }
      }
      if (transition.idempotent && transition.snapshot.state === 'paid' && transition.effect === 'none') {
        return { ok: true as const, already: true }
      }
      if (transition.effect === 'commit') {
        await commitReservationsForOrder(input.projectRef, input.orderId)
      }
      if (transition.snapshot.state === 'paid') {
        await patchOrderPayment(input.projectRef, input.orderId, {
          payment_status: 'paid',
          status: 'paid',
          payment_state: 'paid',
          payment_revision: transition.snapshot.revision,
          provider_event_id: eventId,
        })
      }
      return { ok: true as const, already: transition.idempotent }
    })
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Mark paid failed',
    }
  }
}

export async function markOrderFailed(input: {
  projectRef: string
  orderId: string
  providerEventId?: string
}): Promise<{ ok: true; already?: boolean } | CommerceCheckoutError> {
  try {
    return await withOrderPaymentLock(input.orderId, async () => {
      await ensureCommerceSchema(input.projectRef)
      const order = await getOrderRecord(input.projectRef, input.orderId)
      if (!order) {
        return { ok: false, code: 'invalid_request' as const, message: 'Order not found' }
      }
      const eventId = input.providerEventId || `failed:${input.orderId}`
      const observed = snapshotForOrder(order)
      const transition = compareAndApplyPaymentEvent(observed, observed.state, {
        type: 'provider_failure',
        providerEventId: eventId,
      })
      if (transition.snapshot.state === 'paid') {
        return { ok: true as const, already: true }
      }
      if (transition.effect === 'release') {
        await releaseReservationsForOrder(input.projectRef, input.orderId)
      }
      if (transition.snapshot.state === 'payment_failed') {
        await patchOrderPayment(input.projectRef, input.orderId, {
          payment_status: 'failed',
          status: 'pending',
          payment_state: 'payment_failed',
          payment_revision: transition.snapshot.revision,
          provider_event_id: eventId,
        })
      }
      return { ok: true as const, already: transition.idempotent }
    })
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Mark failed',
    }
  }
}

export async function markOrderFulfillment(input: {
  projectRef: string
  orderId: string
  fulfillmentStatus: FulfillmentStatus
}): Promise<{ ok: true; paymentStatus: string; fulfillmentStatus: FulfillmentStatus } | CommerceCheckoutError> {
  if (!isManagedBackendConfigured()) {
    return { ok: false, code: 'backend_unavailable', message: 'Backend unavailable' }
  }
  try {
    await ensureCommerceSchema(input.projectRef)
    const order = await getOrderRecord(input.projectRef, input.orderId)
    if (!order) {
      return { ok: false, code: 'invalid_request', message: 'Order not found' }
    }
    const current = normalizeFulfillmentStatus(
      typeof order.fulfillment_status === 'string' ? order.fulfillment_status : null,
    )
    const transition = applyFulfillmentTransition(current, input.fulfillmentStatus)
    if (!transition.ok) {
      return { ok: false, code: 'invalid_request', message: transition.message }
    }
    await patchOrderPayment(input.projectRef, input.orderId, {
      fulfillment_status: input.fulfillmentStatus,
    })
    const paymentStatus = normalizePaymentStatus(
      typeof order.payment_status === 'string' ? order.payment_status : String(order.status || ''),
    )
    return {
      ok: true,
      paymentStatus,
      fulfillmentStatus: input.fulfillmentStatus,
    }
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Fulfillment update failed',
    }
  }
}

export async function cancelOpenOrder(input: {
  projectRef: string
  orderId: string
}): Promise<{ ok: true } | CommerceCheckoutError> {
  const failed = await markOrderFailed(input)
  if (!failed.ok) return failed
  const fulfillment = await markOrderFulfillment({
    projectRef: input.projectRef,
    orderId: input.orderId,
    fulfillmentStatus: 'cancelled',
  })
  if (!fulfillment.ok) return fulfillment
  return { ok: true }
}
