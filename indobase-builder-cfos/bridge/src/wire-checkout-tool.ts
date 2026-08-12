/**
 * Agent-facing wireCheckout tool — mint hosted checkout_url for site CTAs.
 * Wraps Platform API payments/wire-checkout.
 */

import { platformPaymentsWireCheckout } from './platform-api-client.js'
import { explainGovernanceGate, operatorMessageForGovernanceCode } from './governance-gates.js'

export const WIRE_CHECKOUT_TOOL = {
  name: 'wireCheckout',
  aliases: ['wirePricing', 'createCheckoutCta', 'wire_checkout'] as const,
  description:
    'Create hosted Razorpay/Stripe checkout with the merchant BYOK keys and return checkout_url. ' +
    'Use that exact URL for Subscribe/Buy CTAs on the site. Never invent a checkout URL. ' +
    'Requires gateway keys first (connectGateway). Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/wireCheckout',
  aliasPath: '/api/os/tools/wirePricing',
  wraps: '/api/os/payments/wire-checkout',
  parameters: {
    type: 'object',
    properties: {
      plan_version_id: {
        type: 'string',
        description: 'Existing plan version id (skip plan create when set)',
      },
      plan_name: { type: 'string', description: 'Plan name when creating (default Starter)' },
      price: {
        type: 'string',
        description: 'Price in major units, e.g. "999" or "19.99" (required if creating plan)',
      },
      currency: { type: 'string', description: 'ISO currency, default INR' },
      billing_period: {
        type: 'string',
        description: 'MONTHLY or ANNUAL (default MONTHLY) — subscription mode only',
      },
      mode: {
        type: 'string',
        description:
          'subscription (default) or one_time / buy — use one_time for ecommerce Buy CTAs',
      },
      customer_id: { type: 'string', description: 'Existing customer id or alias' },
      customer_name: { type: 'string', description: 'Customer name when creating' },
      customer_email: {
        type: 'string',
        description: 'Customer email when creating (required if no customer_id)',
      },
      expires_in_hours: { type: 'number', description: 'Checkout session TTL hours (default 24)' },
    },
  },
} as const

export const WIRE_CHECKOUT_AGENT_HARD_RULES = `
## Wire checkout into the site (HARD PATH — after gateway keys)

When the operator wants pricing/checkout on the live site (after connectGateway):

1. You MUST call the **wireCheckout** tool (alias **wirePricing**) —
   POST /api/os/tools/wireCheckout — e.g.
   Subscription: { "plan_name": "Starter", "price": "999", "currency": "INR", "customer_email": "buyer@example.com" }
   One-time Buy: { "mode": "one_time", "plan_name": "Wool Coat", "price": "480", "currency": "USD", "customer_email": "buyer@example.com" }
   or { "plan_version_id": "…", "customer_id": "…" }.
2. Do NOT use webFetch. Do NOT invent checkout URLs.
3. ONLY use checkout_url from the tool JSON (ok:true). Patch the site Subscribe/Buy CTA href to that URL.
4. If tool returns gateway_not_ready: explain BYOK clearly (India Razorpay vs International Stripe KYC → connectGateway), then retry wireCheckout.
5. For inventory-backed shops: call setupShopCatalog first, then wireCheckout mode one_time per SKU (or shared Buy flow).
6. Claim “checkout is live” only after ok:true + non-empty checkout_url and the CTA is wired into the published site.
7. Never invent Stripe/Razorpay “hosted by Indobase” — operators always bring their own PSP keys.
`.trim()

export type WireCheckoutToolInput = {
  plan_version_id?: string | null
  plan_name?: string | null
  price?: string | number | null
  currency?: string | null
  billing_period?: string | null
  mode?: string | null
  customer_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  expires_in_hours?: number | null
}

export type WireCheckoutToolResult = {
  ok: boolean
  tool: 'wireCheckout'
  claim_checkout_ready: boolean
  checkout_url?: string
  session_id?: string
  plan_version_id?: string
  plan_id?: string
  customer_id?: string
  message: string
  code?: string
  status?: number
  next_steps?: Array<{ id: string; label: string; message?: string }>
  governance?: ReturnType<typeof explainGovernanceGate>
}

export async function executeWireCheckoutTool(
  session: { gotrueId: string; email: string; projectRef: string },
  input: WireCheckoutToolInput,
): Promise<WireCheckoutToolResult> {
  const result = await platformPaymentsWireCheckout({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    planVersionId: input.plan_version_id,
    planName: input.plan_name,
    price:
      typeof input.price === 'number'
        ? String(input.price)
        : typeof input.price === 'string'
          ? input.price
          : null,
    currency: input.currency,
    billingPeriod: input.billing_period,
    mode: input.mode,
    customerId: input.customer_id,
    customerName: input.customer_name,
    customerEmail: input.customer_email,
    expiresInHours: input.expires_in_hours,
  })

  const checkoutUrl =
    typeof result.checkout_url === 'string' && result.checkout_url.startsWith('http')
      ? result.checkout_url
      : undefined
  const claim = result.ok === true && Boolean(checkoutUrl)
  const code = typeof result.code === 'string' ? result.code : undefined
  const governanceMessage = operatorMessageForGovernanceCode(code, {
    fallback:
      typeof result.message === 'string' && result.message.trim()
        ? result.message
        : undefined,
  })
  const byokFallback = explainGovernanceGate({ code: 'gateway_not_ready' })

  return {
    ok: claim,
    tool: 'wireCheckout',
    claim_checkout_ready: claim,
    checkout_url: checkoutUrl,
    session_id: typeof result.session_id === 'string' ? result.session_id : undefined,
    plan_version_id:
      typeof result.plan_version_id === 'string' ? result.plan_version_id : undefined,
    plan_id: typeof result.plan_id === 'string' ? result.plan_id : undefined,
    customer_id: typeof result.customer_id === 'string' ? result.customer_id : undefined,
    message: claim
      ? typeof result.message === 'string' && result.message.trim()
        ? result.message
        : 'Checkout ready'
      : governanceMessage ||
        (code === 'gateway_not_ready' ? byokFallback.message : null) ||
        (typeof result.message === 'string' ? result.message : 'Wire checkout failed'),
    code,
    status: result.status,
    next_steps:
      result.next_steps ||
      (!claim && (code === 'gateway_not_ready' || code === 'payments_byok_required')
        ? byokFallback.choices.map((c) => ({ id: c.label, label: c.label, message: c.message }))
        : undefined),
    governance:
      !claim && (code === 'gateway_not_ready' || code === 'payments_byok_required')
        ? byokFallback
        : undefined,
  }
}

export function wireCheckoutToolCatalog() {
  return {
    name: WIRE_CHECKOUT_TOOL.name,
    aliases: [...WIRE_CHECKOUT_TOOL.aliases],
    description: WIRE_CHECKOUT_TOOL.description,
    method: WIRE_CHECKOUT_TOOL.method,
    path: WIRE_CHECKOUT_TOOL.path,
    alias_path: WIRE_CHECKOUT_TOOL.aliasPath,
    wraps: WIRE_CHECKOUT_TOOL.wraps,
    parameters: WIRE_CHECKOUT_TOOL.parameters,
    rules: WIRE_CHECKOUT_AGENT_HARD_RULES,
  }
}
