import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { listAdminPluginReviewQueue } from 'lib/api/saas/plugin-marketplace'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  return res.status(200).json(await listAdminPluginReviewQueue({ claims: claims as any }))
}
