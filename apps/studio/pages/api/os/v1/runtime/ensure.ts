import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
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

  if (!workspaceRef || !capability) {
    return res.status(400).json({ message: 'workspace_ref and capability required' })
  }

  const claims = claimsFromBody(payload)
  if (!claims) return res.status(400).json({ message: 'gotrue_id required' })

  try {
    const result = await ensureOsCapability({
      claims,
      workspaceRef,
      capability,
    })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(502).json({
      message: error instanceof Error ? error.message : 'Runtime ensure failed',
    })
  }
}
