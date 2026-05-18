/** Redirect to Razorpay hosted checkout when the platform API returns a checkout URL. */
export function redirectToBillingCheckout(data: {
  pending_checkout_url?: string | null
  pending_payment_intent_secret?: string | null
}): boolean {
  const url = data.pending_checkout_url?.trim()
  if (url) {
    window.location.assign(url)
    return true
  }
  return false
}
