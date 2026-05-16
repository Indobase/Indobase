import { NextApiRequest, NextApiResponse } from 'next'

import { fetchGet } from 'data/fetchers'
import type { JwtPayload } from 'indobase-js'
import { constructSaasPgMetaHeaders } from 'lib/api/saas/pg-meta-headers'
import apiWrapper from 'lib/api/apiWrapper'
import { getPgMetaRedirectUrl } from './tables'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) => {
  const headers = await constructSaasPgMetaHeaders(req, claims)
  const response = await fetchGet(getPgMetaRedirectUrl(req, 'views'), { headers })

  if (response.error) {
    const { code, message } = response.error
    return res.status(code).json({ message })
  } else {
    return res.status(200).json(response)
  }
}
