import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import { connectMerchantGatewayKeys } from 'lib/api/saas/merchant-kyc'
import { normalizeSettlementMarket } from 'lib/api/saas/merchant-kyc-provider'
import type { Claims } from 'lib/api/saas/platform'

function claimsFromBody(payload: Record<string, unknown>): Claims | null {
  const sub =
    typeof payload.gotrue_id === 'string'
      ? payload.gotrue_id
      : typeof payload.gotrueId === 'string'
        ? payload.gotrueId
        : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!sub) return null
  return { sub, email, role: 'authenticated' } as Claims
}

/**
 * OS / agent BYOK: paste Razorpay or Stripe API keys after PSP KYC.
 * Validates keys, stores encrypted in Studio, syncs Payments connectors.
 */
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!requireOsApiSecret(req)) {
    return res.status(401).json({ message: 'Unauthorized OS API request' })
  }

  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  const workspaceRef =
    typeof payload.workspace_ref === 'string'
      ? payload.workspace_ref.trim()
      : typeof payload.workspaceRef === 'string'
        ? payload.workspaceRef.trim()
        : ''

  const marketRaw =
    typeof payload.settlement_market === 'string'
      ? payload.settlement_market.trim()
      : typeof payload.settlementMarket === 'string'
        ? payload.settlementMarket.trim()
        : ''

  const market = normalizeSettlementMarket(marketRaw)
  if (!workspaceRef || !market) {
    return res.status(400).json({
      message:
        'workspace_ref and settlement_market (india|international|razorpay|stripe) are required',
    })
  }

  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  const early = assertOsAccountForEnsure({
    gotrueId: claims.sub,
    workspaceRef,
  })
  if (!early.ok) {
    return res.status(403).json({
      ok: false,
      code: early.code,
      message: early.message,
    })
  }

  try {
    const merchant = await connectMerchantGatewayKeys({
      claims,
      ref: workspaceRef,
      body: {
        settlement_market: market,
        key_id: typeof payload.key_id === 'string' ? payload.key_id : null,
        key_secret: typeof payload.key_secret === 'string' ? payload.key_secret : null,
        publishable_key:
          typeof payload.publishable_key === 'string' ? payload.publishable_key : null,
        secret_key: typeof payload.secret_key === 'string' ? payload.secret_key : null,
        webhook_secret:
          typeof payload.webhook_secret === 'string' ? payload.webhook_secret : null,
      },
    })

    return res.status(200).json({
      ok: true,
      message: merchant.aggregator_message || 'Payment gateway keys connected',
      gateway_keys_configured: merchant.gateway_keys_configured,
      gateway_connector_synced: merchant.gateway_connector_synced,
      gateway_key_hint: merchant.gateway_key_hint,
      settlement_market: merchant.settlement_market,
      settlement_adapter: merchant.settlement_adapter,
      can_go_live: merchant.can_go_live,
      next_steps: [
        {
          id: 'wire_checkout',
          label: 'Wire checkout into the site',
          path: 'MCP create_checkout_session',
        },
      ],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connect gateway failed'
    const lower = message.toLowerCase()
    const status =
      lower.includes('owners and admins') || lower.includes('ask an organization')
        ? 403
        : lower.includes('must') ||
            lower.includes('invalid') ||
            lower.includes('required') ||
            lower.includes('looks invalid')
          ? 400
          : 502
    return res.status(status).json({ ok: false, message })
  }
}
