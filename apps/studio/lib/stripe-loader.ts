import { loadStripe, type Stripe } from '@stripe/stripe-js'

import { STRIPE_PUBLIC_KEY } from 'lib/constants'

let stripePromise: Promise<Stripe | null> | null = null

export function getStripePromise() {
  if (!STRIPE_PUBLIC_KEY) return Promise.resolve(null)
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY)
  }
  return stripePromise
}
