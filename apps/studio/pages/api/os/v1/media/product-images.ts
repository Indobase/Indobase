import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import { resolveProductImages } from 'lib/api/saas/product-images'
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

/** OS / agent: resolve commercial stock image URLs for product catalogs. */
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
  if (!workspaceRef) return res.status(400).json({ message: 'workspace_ref required' })

  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  const early = assertOsAccountForEnsure({ gotrueId: claims.sub, workspaceRef })
  if (!early.ok) {
    return res.status(403).json({ ok: false, code: early.code, message: early.message })
  }

  const queriesRaw = Array.isArray(payload.queries)
    ? payload.queries
    : typeof payload.query === 'string'
      ? [payload.query]
      : []
  const queries = queriesRaw.filter((q): q is string => typeof q === 'string')
  const pageSize = typeof payload.page_size === 'number' ? payload.page_size : 3

  try {
    const result = await resolveProductImages({ queries, pageSize })
    return res.status(result.ok ? 200 : result.code === 'query_required' ? 400 : 502).json(result)
  } catch (error) {
    return res.status(502).json({
      ok: false,
      message: error instanceof Error ? error.message : 'product images failed',
    })
  }
}
