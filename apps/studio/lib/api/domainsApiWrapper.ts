import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { resolveDomainsApiClaims } from 'lib/api/saas/domains-api-auth'

import apiWrapper from './apiWrapper'

export default async function domainsApiWrapper(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    claims?: JwtPayload
  ) => Promise<Response | void>
): Promise<Response | void> {
  return apiWrapper(
    req,
    res,
    async (innerReq, innerRes) => {
      const claims = await resolveDomainsApiClaims(innerReq)
      if (!claims) {
        return innerRes.status(401).json({ message: 'Unauthorized' })
      }
      return handler(innerReq, innerRes, claims)
    },
    { withAuth: false }
  )
}
