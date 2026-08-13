/**
 * Storefront / operator checkout copy. Never leak fetch, paymentStatus, or codes.
 */

export const CHECKOUT_CONNECTION_FAILURE =
  "I couldn't complete the order yet. I'll fix the checkout connection."

export const CHECKOUT_ORDER_RECEIVED = 'Order received. You can close this and we will follow up on payment.'

export const CHECKOUT_OUT_OF_STOCK = 'That item just sold out. Update the cart and try again.'

export const CHECKOUT_INVALID = 'Check the email and cart, then try checkout again.'

const INTERNAL_CHECKOUT =
  /\b(fetch failed|paymentStatus|payment_status|ECONNREFUSED|ETIMEDOUT|backend_unavailable|gateway_not_ready|checkout_failed|PocketBase|undici|TypeError)\b/i

export function isInternalCheckoutCopy(message: string | null | undefined): boolean {
  return INTERNAL_CHECKOUT.test(message || '')
}

export function customerFacingCheckoutMessage(input: {
  ok?: boolean
  code?: string
  message?: string
}): string {
  if (input.ok) {
    const raw = (input.message || '').trim()
    if (!raw || isInternalCheckoutCopy(raw) || /pending|reserved|payment/i.test(raw)) {
      return CHECKOUT_ORDER_RECEIVED
    }
    return raw
  }
  if (input.code === 'out_of_stock') return CHECKOUT_OUT_OF_STOCK
  if (input.code === 'invalid_request' || input.code === 'invalid_product') return CHECKOUT_INVALID
  return CHECKOUT_CONNECTION_FAILURE
}
