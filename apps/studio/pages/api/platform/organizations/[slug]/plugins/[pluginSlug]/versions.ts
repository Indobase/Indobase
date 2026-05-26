import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { createPluginVersion } from 'lib/api/saas/plugin-marketplace'

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
  const { slug, pluginSlug } = req.query

  if (typeof slug !== 'string' || !slug) {
    return res.status(400).json({ message: 'Organization slug is required' })
  }

  if (typeof pluginSlug !== 'string' || !pluginSlug) {
    return res.status(400).json({ message: 'Plugin slug is required' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const body = parseRequestBody(req.body)
  if (body === null) {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  return res
    .status(200)
    .json(await createPluginVersion({ claims: claims as any, organizationSlug: slug, slug: pluginSlug, body }))
}
