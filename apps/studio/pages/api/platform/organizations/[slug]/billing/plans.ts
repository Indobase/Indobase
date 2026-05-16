import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { getIndobaseOrgPlansResponse } from 'lib/api/saas/indobase-billing-plans'
import { getOrganizationBillingView } from 'lib/api/saas/platform'
import type { PlanId } from 'data/subscriptions/types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/organizations/{slug}/billing/plans']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
  claims: JwtPayload | undefined
) => {
  const slug =
    typeof req.query.slug === 'string'
      ? req.query.slug
      : Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : ''
  if (!slug) {
    return res.status(400).json({ error: { message: 'Missing organization slug' } } as any)
  }

  const view = await getOrganizationBillingView({ claims: claims as JwtPayload, slug })
  if (!view) {
    return res.status(404).json({ error: { message: 'Organization not found' } } as any)
  }

  const currentPlanId = view.plan.id as PlanId
  const response = getIndobaseOrgPlansResponse(currentPlanId)

  return res.status(200).json(response)
}
