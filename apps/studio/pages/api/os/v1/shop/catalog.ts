import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import {
  listShopCatalog,
  setupShopCatalog,
  type ShopProductInput,
} from 'lib/api/saas/shop-catalog'
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
 * OS / agent: ensure shop schema + seed/list products (tenant DB inventory catalog).
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
    typeof payload.action === 'string' ? payload.action.trim().toLowerCase() : 'setup'
  const brand = typeof payload.brand === 'string' ? payload.brand : null

  const productsRaw = Array.isArray(payload.products) ? payload.products : []
  const products: ShopProductInput[] = productsRaw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      slug: typeof p.slug === 'string' ? p.slug : '',
      name: typeof p.name === 'string' ? p.name : '',
      description: typeof p.description === 'string' ? p.description : null,
      price:
        typeof p.price === 'string'
          ? p.price
          : typeof p.price === 'number'
            ? String(p.price)
            : '',
      currency: typeof p.currency === 'string' ? p.currency : null,
      stock: typeof p.stock === 'number' ? p.stock : null,
      image_url: typeof p.image_url === 'string' ? p.image_url : null,
      active: typeof p.active === 'boolean' ? p.active : null,
    }))

  try {
    const result =
      action === 'list'
        ? await listShopCatalog({ claims, ref: workspaceRef, brand })
        : await setupShopCatalog({
            claims,
            ref: workspaceRef,
            products: action === 'setup' ? products : products,
            brand,
          })

    const status = result.ok
      ? 200
      : result.code === 'database_required'
        ? 403
        : result.code === 'invalid_product'
          ? 400
          : 502
    return res.status(status).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shop catalog failed'
    return res.status(502).json({ ok: false, message })
  }
}
