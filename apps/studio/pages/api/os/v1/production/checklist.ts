import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import {
  evaluateProductionChecklist,
  type ProductionCheckFlags,
} from 'lib/api/saas/production-checklist'
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

/** OS / agent: claim gate — production ready for any app type. */
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

  const checksRaw =
    payload.checks && typeof payload.checks === 'object' && !Array.isArray(payload.checks)
      ? (payload.checks as Record<string, unknown>)
      : {}
  const checks: ProductionCheckFlags = {
    live_url: typeof checksRaw.live_url === 'boolean' ? checksRaw.live_url : null,
    login_wired: typeof checksRaw.login_wired === 'boolean' ? checksRaw.login_wired : null,
    schema_applied:
      typeof checksRaw.schema_applied === 'boolean' ? checksRaw.schema_applied : null,
    checkout_wired:
      typeof checksRaw.checkout_wired === 'boolean' ? checksRaw.checkout_wired : null,
    seo_basics: typeof checksRaw.seo_basics === 'boolean' ? checksRaw.seo_basics : null,
    legal_links: typeof checksRaw.legal_links === 'boolean' ? checksRaw.legal_links : null,
    custom_domain:
      typeof checksRaw.custom_domain === 'boolean' ? checksRaw.custom_domain : null,
  }

  const result = evaluateProductionChecklist({
    app_type: typeof payload.app_type === 'string' ? payload.app_type : null,
    live_url: typeof payload.live_url === 'string' ? payload.live_url : null,
    brand: typeof payload.brand === 'string' ? payload.brand : null,
    checks,
  })

  return res.status(200).json(result)
}
