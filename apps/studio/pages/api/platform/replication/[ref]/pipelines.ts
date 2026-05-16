import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  handleReplicationPipelinesGet,
  handleReplicationPipelinesPost,
  methodNotAllowed,
} from 'lib/api/saas/replication-stubs'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleReplicationPipelinesGet(req, res)
    case 'POST':
      return handleReplicationPipelinesPost(req, res)
    default:
      return methodNotAllowed(res, req.method, ['GET', 'POST'])
  }
}
