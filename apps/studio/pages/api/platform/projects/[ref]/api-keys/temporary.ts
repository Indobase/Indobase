import type { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { createTemporaryProjectApiKey } from 'lib/api/saas/project-api-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const rawExp = req.query.authorization_exp
  const authorizationExp =
    typeof rawExp === 'string' && rawExp.trim() ? Number(rawExp) : undefined

  let requestedClaims: Record<string, unknown> | undefined
  const rawClaims = req.query.claims
  if (typeof rawClaims === 'string' && rawClaims.trim()) {
    try {
      const parsed = JSON.parse(rawClaims) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        requestedClaims = parsed as Record<string, unknown>
      } else {
        return res.status(400).json({ message: 'claims must be a JSON object' })
      }
    } catch {
      return res.status(400).json({ message: 'claims must be valid JSON' })
    }
  }

  try {
    const data = await createTemporaryProjectApiKey({
      claims: claims as JwtPayload & Record<string, unknown>,
      ref,
      authorizationExp: Number.isFinite(authorizationExp) ? authorizationExp : undefined,
      requestedClaims,
    })
    return res.status(200).json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('not found') || message.includes('insufficient')) {
      return res.status(404).json({ message })
    }
    if (message.includes('Temporary API key role')) {
      return res.status(400).json({ message })
    }
    return res.status(500).json({ message })
  }
}
