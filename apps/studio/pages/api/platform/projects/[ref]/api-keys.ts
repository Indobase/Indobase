import type { JwtPayload } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { decryptString } from 'lib/api/self-hosted/util'
import { executeQuery } from 'lib/api/self-hosted/query'
import { selfHostedDefaultProjectRef } from 'lib/api/self-hosted/platform'
import { IS_PLATFORM } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (IS_PLATFORM) {
    return res.status(400).json({ message: 'Not available in platform mode' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const normalizedClaims: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const gotrueId: string | undefined = normalizedClaims?.sub
  if (!gotrueId) return res.status(401).json({ message: 'Missing user session' })

  const resolvedRef = ref === 'default' ? selfHostedDefaultProjectRef(gotrueId) : ref

  const row = await executeQuery<{
    anon_key: string
    service_key: string
    anon_key_enc: string | null
    service_key_enc: string | null
  }>({
    query: `
      select
        p.anon_key,
        p.service_key,
        p.anon_key_enc,
        p.service_key_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [resolvedRef, gotrueId],
    actorId: gotrueId,
  })

  if (row.error) return res.status(500).json({ message: row.error.message })
  if (!row.data?.length) return res.status(404).json({ message: 'Project not found' })

  const p = row.data[0]
  const anon = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const service = p.service_key_enc?.trim() ? decryptString(p.service_key_enc) : p.service_key

  return res.status(200).json([
    { name: 'anon', api_key: anon, type: null },
    { name: 'service_role', api_key: service, type: null },
  ])
}

