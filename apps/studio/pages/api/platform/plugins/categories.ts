import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { listPluginCategories } from 'lib/api/saas/plugin-marketplace'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(_req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  if (_req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${_req.method} Not Allowed` })
  }

  return res.status(200).json(await listPluginCategories())
}
