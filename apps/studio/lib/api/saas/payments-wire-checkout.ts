/**
 * OS wire-checkout: create hosted checkout via merchant Razorpay/Stripe keys (BYOK).
 * Agents get a real checkout_url for site CTAs — no Indobase Payments engine.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  assertMerchantCanGoLive,
  getDecryptedMerchantGatewayKeys,
} from './merchant-kyc'
import {
  createRazorpayHostedCheckout,
  createStripeHostedCheckout,
} from './merchant-psp-checkout'

type Claims = JwtPayload & Record<string, unknown>

export type WireCheckoutBody = {
  /**
   * Optional reuse of a provider plan/price id (Razorpay plan_id or Stripe price_id).
   * When set with price omitted, still needs customer_email for the session.
   */
  plan_version_id?: string | null
  /** Create a simple product/plan when plan_version_id omitted */
  plan_name?: string | null
  /** Major units as decimal string, e.g. "999" or "19.99" */
  price?: string | null
  currency?: string | null
  billing_period?: 'MONTHLY' | 'ANNUAL' | string | null
  /**
   * subscription (default RATE monthly/annual) or one_time (Buy CTA / SKU).
   * Aliases: buy | once → one_time; sub → subscription.
   */
  mode?: 'subscription' | 'one_time' | string | null
  /** Unused in naive path (provider assigns ids); accepted for API compat */
  customer_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  expires_in_hours?: number | null
  success_url?: string | null
  cancel_url?: string | null
}

export type WireCheckoutResult = {
  ok: boolean
  checkout_url?: string
  session_id?: string
  plan_version_id?: string
  plan_id?: string
  customer_id?: string
  provider?: 'razorpay' | 'stripe'
  message: string
  code?: string
}

function isOneTimeMode(raw: string): boolean {
  const modeRaw = raw.trim().toLowerCase()
  return (
    modeRaw === 'one_time' ||
    modeRaw === 'onetime' ||
    modeRaw === 'once' ||
    modeRaw === 'buy' ||
    modeRaw === 'purchase'
  )
}

/**
 * Ensure gateway ready, then mint a hosted checkout URL via the merchant's PSP.
 */
export async function wirePaymentsCheckout({
  claims,
  ref,
  body,
}: {
  claims: Claims
  ref: string
  body: WireCheckoutBody
}): Promise<WireCheckoutResult> {
  try {
    await assertMerchantCanGoLive({ claims, ref })
  } catch (err) {
    return {
      ok: false,
      code: 'gateway_not_ready',
      message:
        err instanceof Error
          ? err.message
          : 'Payment gateway not ready — connect Razorpay/Stripe keys first (connectGateway)',
    }
  }

  const keys = await getDecryptedMerchantGatewayKeys({ claims, ref })
  if (!keys) {
    return {
      ok: false,
      code: 'gateway_not_ready',
      message:
        'Gateway keys missing — call connectGateway with Razorpay or Stripe API keys, then retry',
    }
  }

  const planName = (body.plan_name || 'Starter').trim() || 'Starter'
  const providerPlanOrPriceId = (body.plan_version_id || '').trim() || null
  const price = (body.price || '').trim()
  if (!providerPlanOrPriceId && (!price || Number.isNaN(Number(price)) || Number(price) < 0)) {
    return {
      ok: false,
      code: 'price_required',
      message:
        'Provide plan_name + price (e.g. "999") or plan_version_id (Razorpay plan / Stripe price id)',
    }
  }

  const email = (body.customer_email || '').trim()
  if (!email || !email.includes('@')) {
    return {
      ok: false,
      code: 'customer_email_required',
      message: 'Provide customer_email for the checkout customer',
    }
  }
  const name = (body.customer_name || email || 'Checkout customer').trim()
  const currency =
    (body.currency || (keys.market === 'india' ? 'INR' : 'USD')).trim().toUpperCase() ||
    (keys.market === 'india' ? 'INR' : 'USD')
  const oneTime = isOneTimeMode(body.mode || 'subscription')
  const termRaw = ((body.billing_period || 'MONTHLY').trim().toUpperCase() || 'MONTHLY') as string
  const billingPeriod: 'MONTHLY' | 'ANNUAL' = termRaw === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  const expires =
    typeof body.expires_in_hours === 'number' && body.expires_in_hours >= 0
      ? body.expires_in_hours
      : 24

  try {
    const input = {
      projectRef: ref,
      planName,
      price: price || '0',
      currency,
      oneTime,
      billingPeriod,
      customerEmail: email,
      customerName: name,
      providerPlanOrPriceId,
      expiresInHours: expires,
      successUrl: body.success_url,
      cancelUrl: body.cancel_url,
    }

    if (keys.market === 'india') {
      if (!keys.razorpay?.keyId || !keys.razorpay.keySecret) {
        return {
          ok: false,
          code: 'gateway_not_ready',
          message: 'Razorpay keys not found — reconnect via connectGateway',
        }
      }
      if (providerPlanOrPriceId && !price && oneTime) {
        return {
          ok: false,
          code: 'price_required',
          message:
            'One-time Razorpay checkout needs plan_name + price (plan_version_id reuse is for subscriptions)',
        }
      }
      const result = await createRazorpayHostedCheckout(keys.razorpay, input)
      return {
        ok: true,
        checkout_url: result.checkout_url,
        session_id: result.session_id,
        plan_version_id: result.plan_version_id,
        plan_id: result.plan_id,
        customer_id: result.customer_id || body.customer_id || undefined,
        provider: 'razorpay',
        message:
          'Checkout ready — set the site Subscribe / Buy CTA href to checkout_url. Never invent a URL.',
      }
    }

    if (!keys.stripe?.secretKey) {
      return {
        ok: false,
        code: 'gateway_not_ready',
        message: 'Stripe keys not found — reconnect via connectGateway',
      }
    }
    if (providerPlanOrPriceId && !price) {
      // Reuse existing Stripe price id without recreating product
      input.price = '0'
    }
    const result = await createStripeHostedCheckout(keys.stripe, input)
    return {
      ok: true,
      checkout_url: result.checkout_url,
      session_id: result.session_id,
      plan_version_id: result.plan_version_id,
      plan_id: result.plan_id,
      customer_id: result.customer_id || body.customer_id || undefined,
      provider: 'stripe',
      message:
        'Checkout ready — set the site Subscribe / Buy CTA href to checkout_url. Never invent a URL.',
    }
  } catch (err) {
    return {
      ok: false,
      code: 'psp_checkout_failed',
      message:
        err instanceof Error
          ? err.message
          : 'Hosted checkout failed at the payment provider',
    }
  }
}
