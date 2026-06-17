import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { deleteThirdPartyAuthIntegration } from 'lib/api/saas/third-party-auth'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    return
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  const tpaId = typeof req.query.tpa_id === 'string' ? req.query.tpa_id : ''
  if (!ref || !tpaId) {
    res.status(400).json({ message: 'ref and tpa_id are required' })
    return
  }

  try {
    const ok = await deleteThirdPartyAuthIntegration({
      claims: claims as any,
      ref,
      tpaId,
    })
    if (!ok) {
      res.status(404).json({ message: 'Integration not found' })
      return
    }
    res.status(204).end()
    return
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ message })
    return
  }
}
