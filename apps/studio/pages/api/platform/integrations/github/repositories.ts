import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { listGitHubRepositoriesForUser } from 'lib/api/saas/github-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/integrations/github/repositories']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handleGet = async (res: NextApiResponse<ResponseData>, claims: JwtPayload) => {
  const payload = await listGitHubRepositoriesForUser(claims as any)
  return res.status(200).json(payload)
}
