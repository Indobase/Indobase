import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import {
  wirePaymentsCheckout,
  type WireCheckoutBody,
} from 'lib/api/saas/payments-wire-checkout'
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
 * OS / agent: create plan + customer + hosted checkout session → checkout_url for site CTA.
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

  if (!workspaceRef) {
    return res.status(400).json({ message: 'workspace_ref required' })
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

  const body: WireCheckoutBody = {
    plan_version_id:
      typeof payload.plan_version_id === 'string' ? payload.plan_version_id : null,
    plan_name: typeof payload.plan_name === 'string' ? payload.plan_name : null,
    price: typeof payload.price === 'string' ? payload.price : typeof payload.price === 'number' ? String(payload.price) : null,
    currency: typeof payload.currency === 'string' ? payload.currency : null,
    billing_period:
      typeof payload.billing_period === 'string' ? payload.billing_period : null,
    mode: typeof payload.mode === 'string' ? payload.mode : null,
    customer_id: typeof payload.customer_id === 'string' ? payload.customer_id : null,
    customer_name:
      typeof payload.customer_name === 'string' ? payload.customer_name : null,
    customer_email:
      typeof payload.customer_email === 'string' ? payload.customer_email : null,
    expires_in_hours:
      typeof payload.expires_in_hours === 'number' ? payload.expires_in_hours : null,
  }

  try {
    const result = await wirePaymentsCheckout({ claims, ref: workspaceRef, body })
    const status = result.ok
      ? 200
      : result.code === 'gateway_not_ready'
        ? 403
        : result.code === 'price_required' ||
            result.code === 'customer_email_required'
          ? 400
          : 502
    return res.status(status).json({
      ...result,
      next_steps: result.ok
        ? [
            {
              id: 'patch_cta',
              label: 'Set Subscribe/Buy CTA href to checkout_url on the live site',
            },
          ]
        : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wire checkout failed'
    return res.status(502).json({ ok: false, message })
  }
}
