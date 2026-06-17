import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { listOrganizationProjects } from 'lib/api/saas/platform'

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
  const { method } = req
  const { slug } = req.query

  if (typeof slug !== 'string' || !slug) {
    return res.status(400).json({ message: 'Organization slug is required' })
  }

  switch (method) {
    case 'GET': {
      const limit = toInt(req.query.limit)
      const offset = toInt(req.query.offset)
      const search = typeof req.query.search === 'string' ? req.query.search : undefined

      const statusesParam = req.query.statuses
      const statuses =
        typeof statusesParam === 'string' && statusesParam.length
          ? statusesParam.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined

      return res.status(200).json(
        await listOrganizationProjects({
          claims: claims as any,
          slug,
          limit,
          offset,
          statuses,
          search,
        })
      )
    }
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

