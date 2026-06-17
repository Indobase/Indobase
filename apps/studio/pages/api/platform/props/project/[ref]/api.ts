import type { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getSaaSProjectPropsApiPayload } from 'lib/api/saas/platform'
import {
  DEFAULT_PROJECT,
  PROJECT_ENDPOINT,
  PROJECT_ENDPOINT_PROTOCOL,
  PROJECT_REST_URL,
} from 'lib/constants/api'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  res.setHeader('Cache-Control', 'no-store')

  if (IS_SAAS) {
    if (!claims) {
      return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
    }
    const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
    if (!ref) {
      return res.status(400).json({ data: null, error: { message: 'Project ref is required' } })
    }
    try {
      const payload = await getSaaSProjectPropsApiPayload({ claims, ref })
      if (!payload) {
        return res.status(404).json({ data: null, error: { message: 'Project not found' } })
      }
      return res.status(200).json(payload)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load project props'
      return res.status(500).json({ data: null, error: { message } })
    }
  }

  const response = {
    project: {
      ...DEFAULT_PROJECT,
      api_key_supabase_encrypted: '',
      db_host: 'localhost',
      db_name: 'postgres',
      db_port: 5432,
      db_ssl: false,
      db_user: 'postgres',
      services: [
        {
          id: 1,
          name: 'Default API',
          app: { id: 1, name: 'Auto API' },
          app_config: {
            db_schema: 'public',
            endpoint: PROJECT_ENDPOINT,
            realtime_enabled: true,
          },
          service_api_keys: [
            {
              api_key_encrypted: '-',
              name: 'service_role key',
              tags: 'service_role',
            },
            {
              api_key_encrypted: '-',
              name: 'anon key',
              tags: 'anon',
            },
          ],
        },
      ],
    },
    autoApiService: {
      id: 1,
      name: 'Default API',
      project: { ref: DEFAULT_PROJECT.ref },
      app: { id: 1, name: 'Auto API' },
      app_config: {
        db_schema: 'public',
        endpoint: PROJECT_ENDPOINT,
        realtime_enabled: true,
      },
      protocol: PROJECT_ENDPOINT_PROTOCOL,
      endpoint: PROJECT_ENDPOINT,
      restUrl: PROJECT_REST_URL,
      defaultApiKey: process.env.SUPABASE_ANON_KEY,
      serviceApiKey: process.env.SUPABASE_SERVICE_KEY,
      service_api_keys: [
        {
          api_key_encrypted: '-',
          name: 'service_role key',
          tags: 'service_role',
        },
        {
          api_key_encrypted: '-',
          name: 'anon key',
          tags: 'anon',
        },
      ],
    },
  }

  return res.status(200).json(response)
}
