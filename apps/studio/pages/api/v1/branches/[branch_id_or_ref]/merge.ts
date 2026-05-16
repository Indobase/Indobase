import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { mergeBranchByRef, proxyBranchPlatformRequest } from 'lib/api/saas/branches'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const branchIdOrRef =
    typeof req.query.branch_id_or_ref === 'string'
      ? req.query.branch_id_or_ref
      : Array.isArray(req.query.branch_id_or_ref)
        ? req.query.branch_id_or_ref[0]
        : ''
  if (!branchIdOrRef) {
    return res.status(400).json({ message: 'Missing branch id or ref' })
  }

  const proxied = await proxyBranchPlatformRequest(req, branchIdOrRef, '/merge')
  if (proxied) {
    res.status(proxied.status)
    proxied.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return
      res.setHeader(key, value)
    })
    return res.send(proxied.body)
  }

  if (!IS_SAAS || !claims) {
    return res.status(501).json({ message: 'Branching is not configured' })
  }

  try {
    const result = await mergeBranchByRef({
      claims,
      branchRef: branchIdOrRef,
      migration_version: req.body?.migration_version,
    })
    return res.status(201).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('not found') || message.includes('Not found')) {
      return res.status(404).json({ message })
    }
    console.error('[branch merge]', message, e)
    return res.status(500).json({ message: message || 'Failed to merge database branch' })
  }
}
