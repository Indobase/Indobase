import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { fetchPost } from 'data/fetchers'
import apiWrapper from 'lib/api/apiWrapper'
import {
  getTenantAuthProxyContext,
  tenantAuthProxyHeaders,
} from 'lib/api/tenant-auth-proxy'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) => {
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const { apiOrigin, serviceKey } = await getTenantAuthProxyContext(req, claims)
  const headers = tenantAuthProxyHeaders(serviceKey)
  const url = `${apiOrigin}/auth/v1/recover`
  const payload = { email: req.body.email }

  const response = await fetchPost(url, payload, { headers })
  if (response.error) {
    const { code, message } = response.error
    return res.status(code).json({ message })
  }
  return res.status(200).json(response)
}
