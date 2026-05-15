import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getProject } from 'lib/api/saas/platform'
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
    const project = await getProject({ claims: claims as any, ref })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    const pgPort = parseInt(process.env.POSTGRES_PORT || '5432', 10)
    const body: ResponseData = [
      {
        cloud_provider: project.cloud_provider as any,
        connectionString: project.connectionString,
        connection_string_read_only: '',
        db_host: project.db_host,
        db_name: process.env.POSTGRES_DB || 'postgres',
        db_port: pgPort,
        db_user: process.env.POSTGRES_USER || 'postgres',
        identifier: 'default',
        inserted_at: project.inserted_at,
        region: project.region,
        restUrl: project.restUrl,
        size: '',
        status: project.status as any,
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
