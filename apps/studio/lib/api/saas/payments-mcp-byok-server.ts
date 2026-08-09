/**
 * Studio BYOK Payments MCP — Razorpay/Stripe via merchant keys stored in SaaS.
 * Prefer OS tools connectGateway / wireCheckout; this MCP mirrors the same path for Builder.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { connectMerchantGatewayKeys, getMerchantCanGoLive, getMerchantProfile } from './merchant-kyc'
import { wirePaymentsCheckout } from './payments-wire-checkout'

type Claims = JwtPayload & Record<string, unknown>

function textResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  }
}

export type ByokPaymentsMcpOptions = {
  claims: Claims
  projectRef: string
  readOnly?: boolean
}

/**
 * MCP tools for naive merchant checkout (no Payments engine REST).
 */
export function createByokPaymentsMcpServer(opts: ByokPaymentsMcpOptions) {
  const { claims, projectRef, readOnly = false } = opts
  const server = new McpServer({
    name: 'indobase-payments',
    title: 'Indobase Payments',
    version: '2.0.0',
  })

  server.registerTool(
    'get_gateway_status',
    {
      title: 'Get gateway status',
      description:
        'Show whether Razorpay/Stripe BYOK keys are connected for this project (Studio SaaS).',
      inputSchema: {},
    },
    async () => {
      try {
        const merchant = await getMerchantProfile({ claims, ref: projectRef })
        const canGoLive = await getMerchantCanGoLive({ claims, ref: projectRef })
        return textResult({
          gateway_keys_configured: merchant.gateway_keys_configured,
          can_go_live: canGoLive,
          settlement_market: merchant.settlement_market,
          settlement_adapter: merchant.settlement_adapter,
          gateway_key_hint: merchant.gateway_key_hint,
          next:
            canGoLive
              ? 'Call create_checkout_session or OS wireCheckout with plan_name, price, customer_email'
              : 'Finish PSP KYC, then connect_gateway / OS connectGateway with API keys',
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  if (readOnly) return server

  server.registerTool(
    'connect_gateway',
    {
      title: 'Connect payment gateway keys',
      description:
        'BYOK: store validated Razorpay (india) or Stripe (international) keys in Studio. Prefer OS connectGateway when in Indobase OS.',
      inputSchema: {
        settlement_market: z
          .enum(['india', 'international'])
          .describe('india (Razorpay) or international (Stripe)'),
        key_id: z.string().optional().describe('Razorpay Key Id (rzp_…)'),
        key_secret: z.string().optional().describe('Razorpay Key Secret'),
        publishable_key: z.string().optional().describe('Stripe publishable key (pk_…)'),
        secret_key: z.string().optional().describe('Stripe secret key (sk_…)'),
        webhook_secret: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const merchant = await connectMerchantGatewayKeys({
          claims,
          ref: projectRef,
          body: {
            settlement_market: args.settlement_market,
            key_id: args.key_id,
            key_secret: args.key_secret,
            publishable_key: args.publishable_key,
            secret_key: args.secret_key,
            webhook_secret: args.webhook_secret,
          },
        })
        return textResult({
          ok: true,
          gateway_keys_configured: merchant.gateway_keys_configured,
          can_go_live: merchant.can_go_live,
          settlement_market: merchant.settlement_market,
          message: merchant.aggregator_message,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  // Aliases kept for older Builder skill prompts
  server.registerTool(
    'connect_india_settlements',
    {
      title: 'Connect India settlements keys',
      description: 'Alias for connect_gateway with settlement_market=india (Razorpay BYOK).',
      inputSchema: {
        key_id: z.string().min(1),
        key_secret: z.string().min(1),
        webhook_secret: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const merchant = await connectMerchantGatewayKeys({
          claims,
          ref: projectRef,
          body: {
            settlement_market: 'india',
            key_id: args.key_id,
            key_secret: args.key_secret,
            webhook_secret: args.webhook_secret,
          },
        })
        return textResult({ ok: true, merchant })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'connect_international_cards',
    {
      title: 'Connect international card keys',
      description: 'Alias for connect_gateway with settlement_market=international (Stripe BYOK).',
      inputSchema: {
        api_secret_key: z.string().min(1),
        api_publishable_key: z.string().min(1),
        webhook_secret: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const merchant = await connectMerchantGatewayKeys({
          claims,
          ref: projectRef,
          body: {
            settlement_market: 'international',
            secret_key: args.api_secret_key,
            publishable_key: args.api_publishable_key,
            webhook_secret: args.webhook_secret,
          },
        })
        return textResult({ ok: true, merchant })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'create_checkout_session',
    {
      title: 'Create checkout session',
      description:
        'Create a hosted Razorpay Payment Link or Stripe Checkout Session using the merchant BYOK keys. ' +
        'Returns checkout_url for Buy/Subscribe CTAs. Prefer OS wireCheckout in Indobase OS. ' +
        'Required: customer_email + (plan_name + price) or plan_version_id (Stripe price / Razorpay plan id).',
      inputSchema: {
        plan_name: z.string().optional().describe('Product/plan name (default Starter)'),
        price: z.string().optional().describe('Major units e.g. "999" or "19.99"'),
        currency: z.string().optional(),
        mode: z
          .string()
          .optional()
          .describe('subscription (default) or one_time / buy'),
        billing_period: z.string().optional().describe('MONTHLY or ANNUAL'),
        customer_email: z.string().min(1).describe('Buyer email'),
        customer_name: z.string().optional(),
        plan_version_id: z
          .string()
          .optional()
          .describe('Optional Razorpay plan_id or Stripe price_id to reuse'),
        customer_id: z.string().optional().describe('Ignored — kept for API compat'),
        expires_in_hours: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      try {
        const result = await wirePaymentsCheckout({
          claims,
          ref: projectRef,
          body: {
            plan_name: args.plan_name,
            price: args.price,
            currency: args.currency,
            mode: args.mode,
            billing_period: args.billing_period,
            customer_email: args.customer_email,
            customer_name: args.customer_name,
            plan_version_id: args.plan_version_id,
            customer_id: args.customer_id,
            expires_in_hours: args.expires_in_hours,
          },
        })
        if (!result.ok) {
          return errorResult(new Error(result.message))
        }
        return textResult({
          session: {
            id: result.session_id,
            checkout_url: result.checkout_url,
          },
          checkout_url: result.checkout_url,
          plan_version_id: result.plan_version_id,
          plan_id: result.plan_id,
          provider: result.provider,
          message: result.message,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  return server
}
