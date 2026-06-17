import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@indobaseinc/indobase-js'
import { exportUserPersonalData } from 'lib/api/saas/data-principal'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  res.setHeader('Cache-Control', 'no-store')

  const payload = await exportUserPersonalData(claims as JwtPayload & Record<string, unknown>)
  const filename = `indobase-personal-data-${new Date().toISOString().slice(0, 10)}.json`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).json(payload)
}
