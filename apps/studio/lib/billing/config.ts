import { IS_SAAS } from 'lib/constants'

/** Server: Razorpay secret + key id configured */
export function isRazorpayBillingConfigured(): boolean {
  return Boolean(
    IS_SAAS &&
      process.env.RAZORPAY_KEY_ID?.trim() &&
      process.env.RAZORPAY_KEY_SECRET?.trim()
  )
}

/** Client: show Razorpay checkout flows instead of Stripe Elements */
export function isRazorpayBillingClient(): boolean {
  return Boolean(
    IS_SAAS &&
      (process.env.NEXT_PUBLIC_RAZORPAY_BILLING === 'true' ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim())
  )
}

export const RAZORPAY_PUBLIC_KEY_ID =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || ''
