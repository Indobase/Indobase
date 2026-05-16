import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getProjectBranchByName } from 'lib/api/saas/branches'
import { IS_SAAS } from 'lib/constants'

const branchingBase = process.env.BRANCHING_PLATFORM_API_URL?.replace(/\/$/, '')

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  const name = typeof req.query.name === 'string' ? req.query.name : ''
  if (!ref || !name) {
    return res.status(400).json({ message: 'Project ref and branch name are required' })
  }

  if (branchingBase) {
    const target = `${branchingBase}/v1/projects/${encodeURIComponent(ref)}/branches/${encodeURIComponent(name)}`
    const headers = new Headers()
    const auth = req.headers.authorization
    if (typeof auth === 'string') headers.set('authorization', auth)
    headers.set('accept', 'application/json')
    const upstream = await fetch(target, { method: req.method, headers })
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return
      res.setHeader(key, value)
    })
    return res.send(await upstream.text())
  }

  if (!IS_SAAS || !claims) {
    return res.status(501).json({ message: 'Branching is not configured' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  try {
    const branch = await getProjectBranchByName({ claims, parentRef: ref, name })
    if (!branch) return res.status(404).json({ message: 'Branch not found' })
    return res.status(200).json(branch)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message: message || 'Failed to load branch' })
  }
}
