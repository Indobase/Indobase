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
  sumActiveReservations,
} from './pb-adapter.js'
import type {
  CommerceCheckoutError,
  CommerceCheckoutRequest,
  CommerceCheckoutResult,
  PricedLine,
} from './types.js'

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
  const email = (input.customer?.email || '').trim().toLowerCase()
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
      const quantity = Math.floor(Number(item.quantity || 0))
      if (!productId || quantity < 1) {
        return { ok: false, code: 'invalid_request', message: 'Each item needs productId and quantity ≥ 1' }
      }
      const product = await getCommerceProduct(projectRef, productId)
      if (!product || !product.active) {
        return { ok: false, code: 'invalid_product', message: `Product not found: ${productId}` }
      }
      // Cross-tenant: getCommerceProduct only reads this projectRef's collection.
      currency = product.currency || currency
      const reserved = await sumActiveReservations(projectRef, productId)
      const available = product.stock - reserved
      if (available < quantity) {
        return {
          ok: false,
          code: 'out_of_stock',
          message: `Insufficient stock for ${product.name} (available ${Math.max(0, available)})`,
        }
      }
      lines.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        quantity,
        unitPriceMinor: product.priceMinor,
        lineTotalMinor: product.priceMinor * quantity,
        currency: product.currency,
      })
    }

    const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0)
    const shippingMinor = 0
    const taxMinor = 0
    const amountMinor = subtotalMinor + shippingMinor + taxMinor
    const orderId = newOrderId()
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString()

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
    })

    for (const line of lines) {
      await createReservation({
        projectRef,
        orderId,
        productId: line.productId,
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
    }
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Checkout failed',
    }
  }
}

/** Mark order paid (webhook / operator) — commit reservations + stock. Idempotent. */
export async function markOrderPaid(input: {
  projectRef: string
  orderId: string
  providerEventId?: string
}): Promise<{ ok: true; already?: boolean } | CommerceCheckoutError> {
  if (!isManagedBackendConfigured()) {
    return { ok: false, code: 'backend_unavailable', message: 'Backend unavailable' }
  }
  try {
    const order = await getOrderRecord(input.projectRef, input.orderId)
    if (!order) {
      return { ok: false, code: 'invalid_request', message: 'Order not found' }
    }
    if (order.payment_status === 'paid') {
      return { ok: true, already: true }
    }
    if (input.providerEventId && order.provider_event_id === input.providerEventId) {
      return { ok: true, already: true }
    }
    await commitReservationsForOrder(input.projectRef, input.orderId)
    await patchOrderPayment(input.projectRef, input.orderId, {
      payment_status: 'paid',
      status: 'paid',
      provider_event_id: input.providerEventId || '',
    })
    return { ok: true }
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
}): Promise<{ ok: true } | CommerceCheckoutError> {
  try {
    await releaseReservationsForOrder(input.projectRef, input.orderId)
    await patchOrderPayment(input.projectRef, input.orderId, {
      payment_status: 'failed',
      status: 'cancelled',
    })
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      code: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Mark failed',
    }
  }
}
