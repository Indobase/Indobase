import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  handleReplicationPipelineVersionGet,
  handleReplicationPipelineVersionPost,
  methodNotAllowed,
} from 'lib/api/saas/replication-stubs'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleReplicationPipelineVersionGet(req, res)
    case 'POST':
      return handleReplicationPipelineVersionPost(req, res)
    default:
      return methodNotAllowed(res, req.method, ['GET', 'POST'])
  }
}
