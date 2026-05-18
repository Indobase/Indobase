import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getGotrueUserId } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'
import { decryptString, encryptedConnectionForPgMeta } from 'lib/api/saas/util'
import { resolveSaaSTenantRestUrls } from 'lib/api/saas/tenant-public-urls'
import { PROJECT_REST_URL } from 'lib/constants/api'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/projects/{ref}/databases']['get']['responses']['200']['content']['application/json']

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  if (IS_SAAS) {
    if (!claims) return res.status(401).json({ message: 'Unauthorized' })
    const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
    if (!ref) return res.status(400).json({ message: 'Project ref is required' })
    const gotrueId = getGotrueUserId(claims as any)
    const rows = await executeQuery<{
      cloud_provider: string
      region: string
      status: string
      inserted_at: string | null
      connection_string: string | null
      connection_string_enc: string | null
    }>({
      query: `
        select
          p.cloud_provider,
          p.region,
          p.status,
          p.inserted_at,
          p.connection_string,
          p.connection_string_enc
        from saas.projects p
        join saas.organization_members m on m.organization_id = p.organization_id
        where p.ref = $1 and m.gotrue_id = $2
        limit 1
      `,
      parameters: [ref, gotrueId],
      actorId: gotrueId,
    })
    if (rows.error) throw rows.error
    if (!rows.data?.length) return res.status(404).json({ message: 'Project not found' })

    const p = rows.data[0]!
    const tenantDbUrl =
      p.connection_string_enc?.trim()
        ? decryptString(p.connection_string_enc)
        : p.connection_string
    const hasDedicated = Boolean(tenantDbUrl?.trim())
    const { restUrl } = resolveSaaSTenantRestUrls(ref, hasDedicated)
    const sharedDbUrl =
      process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST && process.env.POSTGRES_DB
        ? `postgres://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD}@${
            process.env.POSTGRES_HOST
          }:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB}`
        : null
    const effectiveDbUrl = tenantDbUrl?.trim() ? tenantDbUrl : sharedDbUrl
    const pgPort = parseInt(process.env.POSTGRES_PORT || '5432', 10)
    const body: ResponseData = [
      {
        cloud_provider: p.cloud_provider as any,
        connectionString: encryptedConnectionForPgMeta(effectiveDbUrl ?? ''),
        connection_string_read_only: '',
        db_host: process.env.POSTGRES_HOST || '127.0.0.1',
        db_name: process.env.POSTGRES_DB || 'postgres',
        db_port: pgPort,
        db_user: process.env.POSTGRES_USER || 'postgres',
        identifier: ref,
        inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
        region: p.region,
        restUrl,
        size: '',
        status: p.status as any,
      },
    ]
    return res.status(200).json(body)
  }

  const body: ResponseData = [
    {
      cloud_provider: 'localhost' as any,
      connectionString: '',
      connection_string_read_only: '',
      db_host: '127.0.0.1',
      db_name: 'postgres',
      db_port: 5432,
      db_user: 'postgres',
      identifier: 'default',
      inserted_at: '',
      region: 'local',
      restUrl: PROJECT_REST_URL,
      size: '',
      status: 'ACTIVE_HEALTHY',
    },
  ]
  return res.status(200).json(body)
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}
