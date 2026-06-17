import type { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { updateProjectGoTrueConfigHooks } from 'lib/api/saas/gotrue-config'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'PATCH':
      return handlePatch(req, res, claims)
    default:
      res.setHeader('Allow', ['PATCH'])
      res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const config = await updateProjectGoTrueConfigHooks({ claims: claims!, ref, patch: body })
  if (!config) return res.status(404).json({ message: 'Project not found' })

  return res.status(200).json(config)
}
