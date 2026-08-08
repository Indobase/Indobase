/**
 * Push Studio BYOK gateway keys into Indobase Payments connectors (one paste).
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { createPaymentsApiClient, mintPaymentsMcpBearer } from './payments-mcp'

type Claims = JwtPayload & Record<string, unknown>

export type GatewaySyncResult = {
  ok: boolean
  connectorId?: string
  alias?: string
  provider?: string
  message: string
}

/**
 * Sync decrypted Studio merchant keys into Payments REST connectors.
 * Replaces any existing payment-provider connector for that rail.
 */
export async function syncMerchantGatewayKeysToPayments({
  claims,
  ref,
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
  try {
    const minted = await mintPaymentsMcpBearer({ claims, projectRef: ref })
    const client = createPaymentsApiClient({
      apiBaseUrl: minted.apiBaseUrl,
      bearerToken: minted.bearerToken,
    })

    if (market === 'india') {
      if (!razorpay?.keyId || !razorpay.keySecret) {
        return { ok: false, message: 'Missing Razorpay keys for Payments sync' }
      }
      const data = await client.request<{
        connector?: { id?: string; alias?: string; provider?: string }
      }>('POST', '/api/v1/connectors/razorpay', {
        body: {
          alias: 'india',
          key_id: razorpay.keyId,
          key_secret: razorpay.keySecret,
          webhook_secret: razorpay.webhookSecret || '',
        },
      })
      return {
        ok: true,
        connectorId: data.connector?.id,
        alias: data.connector?.alias || 'india',
        provider: data.connector?.provider || 'razorpay',
        message: 'India settlements connector synced in Indobase Payments',
      }
    }

    if (!stripe?.secretKey) {
      return { ok: false, message: 'Missing Stripe secret key for Payments sync' }
    }
    const data = await client.request<{
      connector?: { id?: string; alias?: string; provider?: string }
    }>('POST', '/api/v1/connectors/stripe', {
      body: {
        alias: 'international',
        api_publishable_key: stripe.publishableKey || '',
        api_secret_key: stripe.secretKey,
        webhook_secret: stripe.webhookSecret || '',
      },
    })
    return {
      ok: true,
      connectorId: data.connector?.id,
      alias: data.connector?.alias || 'international',
      provider: data.connector?.provider || 'stripe',
      message: 'International cards connector synced in Indobase Payments',
    }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Failed to sync gateway keys into Indobase Payments',
    }
  }
}
