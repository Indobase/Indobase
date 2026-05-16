import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { handleReplicationDestinationsGet, methodNotAllowed } from 'lib/api/saas/replication-stubs'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleReplicationDestinationsGet(req, res)
    default:
      return methodNotAllowed(res, req.method, ['GET'])
  }
}
