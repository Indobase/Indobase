import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  hasValidProjectDeploymentRuntimeToken,
  processProjectDeploymentBatch,
} from 'lib/api/saas/deployments'

type ProcessDeploymentsBody = {
  limit?: number
  worker_id?: string
}

const processProjectDeploymentsHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)

export default processProjectDeploymentsHandler

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!hasValidProjectDeploymentRuntimeToken(req.headers)) {
    return res.status(401).json({ message: 'Unauthorized deployment processor request' })
  }

  const body = (req.body || {}) as ProcessDeploymentsBody
  const result = await processProjectDeploymentBatch({
    limit: body.limit,
    workerId: body.worker_id,
  })
  return res.status(200).json(result)
}
