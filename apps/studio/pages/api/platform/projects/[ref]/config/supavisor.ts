import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { paths } from 'api-types'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getSaaSSupavisorConfigRows } from 'lib/api/saas/platform'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseBody =
  paths['/platform/projects/{ref}/config/supavisor']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ data: null, error: { message: 'Method not allowed' } })
  }
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  if (!IS_SAAS) {
    return res.status(503).json({
      message:
        'Supavisor config is served by the management API in self-hosted mode. Enable SaaS (IS_SAAS) for this route.',
    })
  }

  const rows = await getSaaSSupavisorConfigRows({ claims, ref })
  if (!rows) return res.status(404).json({ message: 'Project not found' })

  return res.status(200).json(rows as ResponseBody)
}
