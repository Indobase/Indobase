import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  hasValidProjectMobileBuildRuntimeToken,
  processProjectMobileBuildBatch,
} from 'lib/api/saas/mobile-builds'

type ProcessMobileBuildsBody = {
  limit?: number
  worker_id?: string
}

const processProjectMobileBuildsHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)

export default processProjectMobileBuildsHandler

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!hasValidProjectMobileBuildRuntimeToken(req.headers)) {
    return res.status(401).json({ message: 'Unauthorized mobile build processor request' })
  }

  const body = (req.body || {}) as ProcessMobileBuildsBody
  const result = await processProjectMobileBuildBatch({
    limit: body.limit,
    workerId: body.worker_id,
  })
  return res.status(200).json(result)
}
