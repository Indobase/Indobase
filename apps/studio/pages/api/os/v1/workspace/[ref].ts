import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { getOsWorkspace } from 'lib/api/saas/os-workspace'
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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!requireOsApiSecret(req)) {
    return res.status(401).json({ message: 'Unauthorized OS API request' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  const gotrueId = typeof req.query.gotrue_id === 'string' ? req.query.gotrue_id : ''
  const email = typeof req.query.email === 'string' ? req.query.email : ''
  if (!ref || !gotrueId) {
    return res.status(400).json({ message: 'ref and gotrue_id required' })
  }

  const claims = claimsFromBody({ gotrue_id: gotrueId, email })
  if (!claims) return res.status(400).json({ message: 'Invalid identity' })

  try {
    const workspace = await getOsWorkspace({ claims, ref })
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' })
    return res.status(200).json({ ok: true, workspace })
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to load workspace',
    })
  }
}
