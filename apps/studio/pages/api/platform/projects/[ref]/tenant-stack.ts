import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getTenantStackArtifacts, resolvePublicDomainForTenantStack } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const artifacts = await getTenantStackArtifacts({
    claims,
    ref,
    publicDomain: resolvePublicDomainForTenantStack(),
  })

  if (!artifacts) {
    return res.status(404).json({
      message:
        'Tenant stack artifacts are not available for this project. They require a per-project database connection (dedicated DB mode). Shared-database (Model A) projects use the platform Kong/PostgREST stack instead.',
    })
  }

  return res.status(200).json(artifacts)
}
