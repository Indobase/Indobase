/**
 * Agent-facing connectGateway tool — BYOK Razorpay/Stripe keys after PSP KYC.
 * Wraps Platform API payments/connect-gateway (same as POST /api/os/payments/connect-gateway).
 */

import type { PaymentsConnectGatewayResponse } from '@indobase/platform-api'

import { platformPaymentsConnectGateway } from './platform-api-client.js'

export const CONNECT_GATEWAY_TOOL = {
  name: 'connectGateway',
  aliases: ['connectPaymentGateway', 'connect_gateway', 'pastePaymentKeys'] as const,
  description:
    'Connect payment gateway keys after the operator finishes KYC on Razorpay or Stripe. ' +
    'Posts keys to Indobase (validated + synced to Payments connectors). Never invent keys. ' +
    'Do not use webFetch (GET-only). Alias: connectPaymentGateway.',
  method: 'POST' as const,
  path: '/api/os/tools/connectGateway',
  aliasPath: '/api/os/tools/connectPaymentGateway',
  wraps: '/api/os/payments/connect-gateway',
  parameters: {
    type: 'object',
    required: ['settlement_market'],
    properties: {
      settlement_market: {
        type: 'string',
        description: 'india | international (aliases razorpay | stripe)',
      },
      key_id: { type: 'string', description: 'Razorpay Key Id (rzp_…) — India' },
      key_secret: { type: 'string', description: 'Razorpay Key Secret — India' },
      publishable_key: {
        type: 'string',
        description: 'Stripe publishable key (pk_…) — International',
      },
      secret_key: { type: 'string', description: 'Stripe secret key (sk_…) — International' },
      webhook_secret: { type: 'string', description: 'Optional webhook signing secret' },
    },
  },
} as const

export const CONNECT_GATEWAY_AGENT_HARD_RULES = `
## Connect payment gateway keys (HARD PATH — when operator pastes keys)

When the operator pastes Razorpay or Stripe API keys (after PSP dashboard KYC):

1. You MUST call the **connectGateway** tool (alias **connectPaymentGateway**) —
   POST /api/os/tools/connectGateway — with REAL keys from the operator.
   India: { "settlement_market": "india", "key_id": "rzp_…", "key_secret": "…" }
   International: { "settlement_market": "international", "secret_key": "sk_…", "publishable_key": "pk_…" }
2. Do NOT use webFetch for this (GET-only, no cookies). Do NOT invent or guess keys.
3. Quote the tool JSON: ok, gateway_connector_synced, can_go_live, message.
4. Only then call **wireCheckout** (POST /api/os/tools/wireCheckout) and patch the site CTA to checkout_url.
5. Studio UI Connect gateway is a fallback; prefer this OS tool when keys are in chat.
`.trim()

export type ConnectGatewayToolInput = {
  settlement_market?: string
  settlementMarket?: string
  key_id?: string | null
  key_secret?: string | null
  publishable_key?: string | null
  secret_key?: string | null
  webhook_secret?: string | null
}

export type ConnectGatewayToolResult = PaymentsConnectGatewayResponse & {
  tool: 'connectGateway'
  claim_gateway_ready: boolean
  status?: number
}

function normalizeMarket(raw: string | undefined): string {
  return (raw || '').trim()
}

export function assertConnectGatewayHasKeys(input: ConnectGatewayToolInput): {
  ok: boolean
  message?: string
  market?: string
} {
  const market = normalizeMarket(input.settlement_market || input.settlementMarket)
  if (!market) {
    return {
      ok: false,
      message: 'settlement_market required (india|international|razorpay|stripe)',
    }
  }
  const lower = market.toLowerCase()
  const india = lower === 'india' || lower === 'razorpay' || lower === 'razorpay_route'
  const intl =
    lower === 'international' || lower === 'stripe' || lower === 'cards'

  if (!india && !intl) {
    return {
      ok: false,
      message: 'settlement_market must be india|international (or razorpay|stripe)',
    }
  }

  if (india) {
    const keyId = (input.key_id || '').trim()
    const keySecret = (input.key_secret || '').trim()
    if (!keyId || !keySecret) {
      return {
        ok: false,
        message: 'India requires key_id and key_secret from the Razorpay Dashboard',
      }
    }
  } else {
    const secretKey = (input.secret_key || '').trim()
    const publishableKey = (input.publishable_key || '').trim()
    if (!secretKey || !publishableKey) {
      return {
        ok: false,
        message:
          'International requires secret_key and publishable_key from the Stripe Dashboard',
      }
    }
  }

  return { ok: true, market }
}

/**
 * Execute BYOK connect. claim_gateway_ready when keys validated and go-live unlocked.
 */
export async function executeConnectGatewayTool(
  session: { gotrueId: string; email: string; projectRef: string },
  input: ConnectGatewayToolInput,
): Promise<ConnectGatewayToolResult> {
  const check = assertConnectGatewayHasKeys(input)
  if (!check.ok || !check.market) {
    return {
      ok: false,
      message: check.message || 'Invalid connectGateway input',
      tool: 'connectGateway',
      claim_gateway_ready: false,
      status: 400,
    }
  }

  const result = await platformPaymentsConnectGateway({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    settlementMarket: check.market,
    keyId: input.key_id,
    keySecret: input.key_secret,
    publishableKey: input.publishable_key,
    secretKey: input.secret_key,
    webhookSecret: input.webhook_secret,
  })

  const claim =
    result.ok === true &&
    (result.can_go_live === true || result.gateway_keys_configured === true)

  return {
    ...result,
    tool: 'connectGateway',
    claim_gateway_ready: claim,
  }
}

/** Session catalog entry so agents discover the tool. */
export function connectGatewayToolCatalog() {
  return {
    name: CONNECT_GATEWAY_TOOL.name,
    aliases: [...CONNECT_GATEWAY_TOOL.aliases],
    description: CONNECT_GATEWAY_TOOL.description,
    method: CONNECT_GATEWAY_TOOL.method,
    path: CONNECT_GATEWAY_TOOL.path,
    alias_path: CONNECT_GATEWAY_TOOL.aliasPath,
    wraps: CONNECT_GATEWAY_TOOL.wraps,
    parameters: CONNECT_GATEWAY_TOOL.parameters,
    rules: CONNECT_GATEWAY_AGENT_HARD_RULES,
  }
}
