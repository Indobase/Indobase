import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  createOrganizationPluginListing,
  listOrganizationPlugins,
} from 'lib/api/saas/plugin-marketplace'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

function parseRequestBody(body: NextApiRequest['body']) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { slug } = req.query

  if (typeof slug !== 'string' || !slug) {
    return res.status(400).json({ message: 'Organization slug is required' })
  }

  switch (req.method) {
    case 'GET':
      return res.status(200).json(await listOrganizationPlugins({ claims: claims as any, slug }))
    case 'POST': {
      const body = parseRequestBody(req.body)
      if (body === null) {
        return res.status(400).json({ message: 'Invalid JSON body' })
      }
      return res
        .status(200)
        .json(await createOrganizationPluginListing({ claims: claims as any, organizationSlug: slug, body }))
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}
