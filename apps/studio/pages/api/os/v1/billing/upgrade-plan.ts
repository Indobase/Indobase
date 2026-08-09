import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { assertOsAccountForEnsure } from 'lib/api/saas/os-ensurer-access'
import { upgradeOsOrganizationPlan } from 'lib/api/saas/os-plan-upgrade'
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

function str(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** POST — OS agent upgradePlan (Razorpay checkout; never invent Pro). */
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

  const workspaceRef = str(payload, 'workspace_ref', 'workspaceRef') || ''
  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ ok: false, message: 'gotrue_id required' })
  if (!workspaceRef) {
    return res.status(400).json({ ok: false, message: 'workspace_ref required' })
  }

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
    const result = await upgradeOsOrganizationPlan({
      claims,
      workspaceRef,
      plan: str(payload, 'plan', 'target_plan', 'targetPlan'),
      tier: str(payload, 'tier'),
    })
    if (!result.ok) {
      return res.status(result.status).json(result)
    }
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to start plan upgrade',
    })
  }
}
