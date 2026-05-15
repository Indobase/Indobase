import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getSaaSOrgPropsPayload } from 'lib/api/saas/platform'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: IS_SAAS })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  if (IS_SAAS) {
    if (!claims) {
      return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
    }
    const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
    if (!slug) {
      return res.status(400).json({ data: null, error: { message: 'Organization slug is required' } })
    }
    try {
      const payload = await getSaaSOrgPropsPayload({ claims, slug })
      if (!payload) {
        return res.status(404).json({ data: null, error: { message: 'Organization not found' } })
      }
      return res.status(200).json(payload)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load organization props'
      return res.status(500).json({ data: null, error: { message } })
    }
  }

  const response = {
    members: [],
    products: [],
    customer: {
      customer: {},
      subscriptions: {},
      total_paid_projects: 0,
      total_free_projects: 0,
      total_pro_projects: 0,
      total_team_projects: 0,
      total_payg_projects: 0,
    },
  }

  return res.status(200).json(response)
}
