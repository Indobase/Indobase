import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import { ensureOsCapability } from 'lib/api/saas/os-ensurer'
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
  const capability = typeof payload.capability === 'string' ? payload.capability.trim() : ''
  const settlementMarketRaw =
    typeof payload.settlement_market === 'string'
      ? payload.settlement_market.trim()
      : typeof payload.settlementMarket === 'string'
        ? payload.settlementMarket.trim()
        : typeof payload.settlement_adapter === 'string'
          ? payload.settlement_adapter.trim()
          : typeof payload.adapter === 'string'
            ? payload.adapter.trim()
            : undefined

  if (!workspaceRef || !capability) {
    return res.status(400).json({ message: 'workspace_ref and capability required' })
  }

  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  // Early guest/draft reject (plan gate still runs inside ensurer with org plan).
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
    // Passes through launch_url / setup_status when present (commerce/email pending_setup).
    const result = await ensureOsCapability({
      claims,
      workspaceRef,
      capability,
      settlementMarket: settlementMarketRaw,
    })
    return res.status(200).json(result)
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 502
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code || '')
        : undefined
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
      ok: false,
      ...(code ? { code } : {}),
      message: error instanceof Error ? error.message : 'Runtime ensure failed',
    })
  }
}
