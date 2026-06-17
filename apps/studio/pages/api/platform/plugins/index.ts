import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { listMarketplacePlugins } from 'lib/api/saas/plugin-marketplace'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

function toInt(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  const limit = toInt(req.query.limit)
  const offset = toInt(req.query.offset)

  const data = await listMarketplacePlugins({
    claims: claims as any,
    search,
    category,
    limit,
    offset,
  })

  return res.status(200).json(data)
}
