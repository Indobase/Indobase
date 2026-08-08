import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import { listShopCatalog, placeTestShopOrder } from 'lib/api/saas/shop-catalog'
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
 * OS / agent: list shop orders or place a test order (atomic stock decrement).
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

  const action =
    typeof payload.action === 'string' ? payload.action.trim().toLowerCase() : 'list'
  const brand = typeof payload.brand === 'string' ? payload.brand : null

  try {
    if (action === 'place' || action === 'test') {
      const orderEmail =
        typeof payload.order_email === 'string'
          ? payload.order_email
          : typeof payload.customer_email === 'string'
            ? payload.customer_email
            : ''
      const itemsRaw = Array.isArray(payload.items) ? payload.items : []
      const items = itemsRaw
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({
          product_id: typeof i.product_id === 'string' ? i.product_id : undefined,
          slug: typeof i.slug === 'string' ? i.slug : undefined,
          quantity: typeof i.quantity === 'number' ? i.quantity : 1,
        }))
      const cleanup = payload.cleanup === true || action === 'test'

      const result = await placeTestShopOrder({
        claims,
        ref: workspaceRef,
        email: orderEmail,
        items,
        cleanup,
        brand,
      })
      const status = result.ok
        ? 200
        : result.code === 'invalid_order'
          ? 400
          : result.code === 'database_required'
            ? 403
            : 502
      return res.status(status).json(result)
    }

    const result = await listShopCatalog({ claims, ref: workspaceRef, brand })
    const status = result.ok ? 200 : result.code === 'database_required' ? 403 : 502
    return res.status(status).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shop orders failed'
    return res.status(502).json({ ok: false, message })
  }
}
