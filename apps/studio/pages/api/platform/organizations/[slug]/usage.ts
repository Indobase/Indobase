import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getOrganizationUsage } from 'lib/api/saas/org-usage'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ message: 'Organization slug is required' })

  const projectRef =
    typeof req.query.project_ref === 'string'
      ? req.query.project_ref
      : typeof req.query.projectRef === 'string'
        ? req.query.projectRef
        : undefined
  const start = typeof req.query.start === 'string' ? req.query.start : undefined
  const end = typeof req.query.end === 'string' ? req.query.end : undefined

  try {
    const usage = await getOrganizationUsage({
      claims: claims ?? {},
      slug,
      query: { projectRef, start, end },
    })
    return res.status(200).json(usage)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load organization usage'
    if (message === 'Organization not found') {
      return res.status(404).json({ message })
    }
    return res.status(500).json({ message })
  }
}
