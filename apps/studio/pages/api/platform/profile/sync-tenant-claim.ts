import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { syncStudioUserTenantClaim } from 'lib/api/saas/syncStudioTenantClaim'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { message: 'Method Not Allowed' } })
  }

  const body = req.body as { organizationSlug?: unknown }
  const organizationSlug =
    typeof body?.organizationSlug === 'string' ? body.organizationSlug : ''

  const result = await syncStudioUserTenantClaim({
    claims: claims as JwtPayload & Record<string, unknown>,
    organizationSlug,
  })

  if (!result.ok) {
    return res.status(result.status ?? 500).json({
      error: { message: result.message },
    })
  }

  return res.status(200).json({
    tenant_id: result.tenant_id,
    skipped: result.skipped ?? false,
  })
}
