import type { JwtPayload } from 'indobase-js'
import type { components } from 'api-types'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { updateProjectJwtSecret } from 'lib/api/saas/update-project-jwt-secret'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH'])
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
    return res.status(501).json({
      message: 'Per-project JWT secret updates are only supported in SaaS mode',
    })
  }

  let body: components['schemas']['UpdateSecretsConfigBody']
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  const jwt_secret = typeof body.jwt_secret === 'string' ? body.jwt_secret : ''
  const change_tracking_id =
    typeof body.change_tracking_id === 'string' ? body.change_tracking_id : ''

  try {
    const result = await updateProjectJwtSecret({
      claims,
      ref,
      jwtSecret: jwt_secret,
      changeTrackingId: change_tracking_id,
    })
    return res.status(200).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update JWT secret'
    const status = /insufficient permissions|not found/i.test(message) ? 403 : 500
    return res.status(status).json({ message })
  }
}
