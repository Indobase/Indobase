/**
 * Legacy Payments-engine connector sync — intentionally a no-op.
 *
 * Merchant Razorpay/Stripe keys stay encrypted in Studio SaaS only.
 * Checkout uses direct PSP APIs (see merchant-psp-checkout / wirePaymentsCheckout).
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

type Claims = JwtPayload & Record<string, unknown>

export type GatewaySyncResult = {
  ok: boolean
  connectorId?: string
  alias?: string
  provider?: string
  message: string
}

/**
 * Previously pushed BYOK keys into Indobase Payments connectors.
 * Now records Studio-only readiness so connectGateway / wireCheckout stay billing-engine-free.
 */
export async function syncMerchantGatewayKeysToPayments({
  market,
  razorpay,
  stripe,
}: {
  claims: Claims
  ref: string
  market: 'india' | 'international'
  razorpay?: { keyId: string; keySecret: string; webhookSecret?: string }
  stripe?: { secretKey: string; publishableKey?: string; webhookSecret?: string }
}): Promise<GatewaySyncResult> {
  if (market === 'india') {
    if (!razorpay?.keyId || !razorpay.keySecret) {
      return { ok: false, message: 'Missing Razorpay keys' }
    }
    return {
      ok: true,
      alias: 'india',
      provider: 'razorpay',
      message: 'Razorpay keys stored in Studio — checkout uses Razorpay APIs directly',
    }
  }

  if (!stripe?.secretKey) {
    return { ok: false, message: 'Missing Stripe secret key' }
  }
  return {
    ok: true,
    alias: 'international',
    provider: 'stripe',
    message: 'Stripe keys stored in Studio — checkout uses Stripe APIs directly',
  }
}
