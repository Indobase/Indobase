import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getProjectJwtSecretUpdateStatus } from 'lib/api/saas/update-project-jwt-secret'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!IS_SAAS) {
    return res.status(200).json({ update_status: null })
  }

  try {
    const result = await getProjectJwtSecretUpdateStatus({ claims, ref })
    return res.status(200).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load JWT secret update status'
    const status = /not found/i.test(message) ? 404 : 500
    return res.status(status).json({ message })
  }
}
