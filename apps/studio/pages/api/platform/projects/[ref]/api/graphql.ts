import type { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getGotrueUserId } from 'lib/api/saas/platform'
import { resolveSaaSTenantRestUrls } from 'lib/api/saas/tenant-public-urls'
import { decryptString } from 'lib/api/saas/util'
import { executeQuery } from 'lib/api/saas/query'
import { IS_SAAS } from 'lib/constants'

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

async function resolveGraphqlUpstream(ref: string, claims: JwtPayload) {
  if (IS_SAAS) {
    const gotrueId = getGotrueUserId(claims as any)
    const row = await executeQuery<{
      connection_string_enc: string | null
      data_plane_last_provisioned_at: string | null
      data_plane_mode: string
    }>({
      query: `
        select p.connection_string_enc, p.data_plane_last_provisioned_at, p.data_plane_mode
        from saas.projects p
        join saas.organization_members m on m.organization_id = p.organization_id
        where p.ref = $1 and m.gotrue_id = $2
        limit 1
      `,
      parameters: [ref, gotrueId],
      actorId: gotrueId,
    })
    if (row.error) throw row.error
    const meta = row.data?.[0]
    const hasDedicated = Boolean(meta?.connection_string_enc?.trim())
    const { endpointHost, protocol } = resolveSaaSTenantRestUrls(
      ref,
      hasDedicated,
      meta?.data_plane_mode
    )
    return `${protocol}://${endpointHost}/graphql/v1`
  }

  const base = process.env.SUPABASE_URL
  if (!base) throw new Error('SUPABASE_URL is not set on Studio')
  return `${base.replace(/\/$/, '')}/graphql/v1`
}

async function resolveGraphqlApiKey(ref: string, claims: JwtPayload) {
  if (!IS_SAAS) return process.env.SUPABASE_SERVICE_KEY!

  const gotrueId = getGotrueUserId(claims as any)
  const row = await executeQuery<{ anon_key: string; anon_key_enc: string | null }>({
    query: `
      select p.anon_key, p.anon_key_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return process.env.SUPABASE_ANON_KEY!
  return p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ error: { message: 'Project ref is required' } })
  if (!claims) return res.status(401).json({ error: { message: 'Unauthorized' } })

  const graphqlUrl = await resolveGraphqlUpstream(ref, claims)
  if (!graphqlUrl) return res.status(404).json({ error: { message: 'Project not found' } })

  const apiKey = await resolveGraphqlApiKey(ref, claims)
  const authorizationHeader = req.headers['x-graphql-authorization']

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization:
        (Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader) ??
        `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body),
  })

  if (response.ok) {
    const data = await response.json()
    return res.status(200).json(data)
  }

  return res.status(response.status).json({
    error: { message: `GraphQL API request failed (${response.status})` },
  })
}
