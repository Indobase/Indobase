import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { getVercelRedirectUrl } from 'lib/api/saas/vercel-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/vercel/redirect/{installation_id}']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }

  const raw = req.query.installation_id
  const installationId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  if (!installationId) {
    return res.status(400).json({ message: 'installation_id is required' } as any)
  }

  return res.status(200).json(getVercelRedirectUrl(installationId) as ResponseData)
}
