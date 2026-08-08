/**
 * Merchant payment gateway BYOK helpers — KYC on Razorpay/Stripe dashboards,
 * then paste API keys into Indobase. Agents wire checkout against those keys.
 */

import type { SettlementMarket } from './merchant-kyc-provider'

export type GatewayConnectBody = {
  settlement_market: SettlementMarket
  /** Razorpay Key Id (rzp_test_… / rzp_live_…) */
  key_id?: string | null
  /** Razorpay Key Secret */
  key_secret?: string | null
  /** Stripe publishable key (pk_…) */
  publishable_key?: string | null
  /** Stripe secret key (sk_…) */
  secret_key?: string | null
  /** Webhook signing secret */
  webhook_secret?: string | null
}

export function hintId(value: string): string {
  const v = value.trim()
  if (v.length <= 8) return '••••'
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export async function validateRazorpayKeys(keyId: string, keySecret: string): Promise<void> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/customers?count=1', {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'IndobaseStudio/GatewayBYOK',
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Invalid Razorpay API keys — check Key Id and Key Secret from https://dashboard.razorpay.com/app/keys'
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Razorpay key check failed (HTTP ${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`
    )
  }
}

export async function validateStripeKeys(secretKey: string): Promise<void> {
  const res = await fetch('https://api.stripe.com/v1/balance', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'User-Agent': 'IndobaseStudio/GatewayBYOK',
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Invalid Stripe secret key — use a key from https://dashboard.stripe.com/apikeys after account verification'
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Stripe key check failed (HTTP ${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`
    )
  }
}

export const GATEWAY_EXTERNAL_LINKS = {
  india: {
    signup: 'https://dashboard.razorpay.com/signup',
    kyc: 'https://razorpay.com/docs/payments/dashboard/account-settings/',
    keys: 'https://dashboard.razorpay.com/app/keys',
    webhooks: 'https://dashboard.razorpay.com/app/webhooks',
  },
  international: {
    signup: 'https://dashboard.stripe.com/register',
    kyc: 'https://dashboard.stripe.com/settings/account',
    keys: 'https://dashboard.stripe.com/apikeys',
    webhooks: 'https://dashboard.stripe.com/webhooks',
  },
} as const
