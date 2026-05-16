import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  handleReplicationPublicationsGet,
  handleReplicationPublicationsPost,
  methodNotAllowed,
} from 'lib/api/saas/replication-stubs'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleReplicationPublicationsGet(req, res)
    case 'POST':
      return handleReplicationPublicationsPost(req, res)
    default:
      return methodNotAllowed(res, req.method, ['GET', 'POST'])
  }
}
