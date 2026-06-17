import type { JwtPayload } from '@indobaseinc/indobase-js'
import { components } from 'api-types'
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getProjectPostgrestConfig,
  updateProjectPostgrestConfig,
} from 'lib/api/saas/postgrest-config'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: IS_SAAS })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    case 'PATCH':
      return handlePatch(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'PATCH'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''

  if (!IS_SAAS || !claims || !ref) {
    return res.status(200).json({
      db_anon_role: 'anon',
      db_extra_search_path: 'public',
      db_schema: 'public, storage',
      jwt_secret:
        process.env.AUTH_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long',
      max_rows: 100,
      role_claim_key: '.role',
    })
  }

  try {
    const config = await getProjectPostgrestConfig({ claims, ref })
    if (!config) {
      return res.status(404).json({ message: 'Project not found' })
    }
    return res.status(200).json(config)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load config'
    return res.status(500).json({ message })
  }
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!IS_SAAS || !claims || !ref) {
    return res.status(200).json({})
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
    | (components['schemas']['UpdatePostgrestConfigBody'] & Record<string, unknown>)
    | undefined

  const hasPostgrestFields =
    body &&
    ('db_schema' in body ||
      'max_rows' in body ||
      'db_extra_search_path' in body ||
      'db_pool' in body)

  if (!hasPostgrestFields) {
    return res.status(200).json({})
  }

  const patch: components['schemas']['UpdatePostgrestConfigBody'] = {
    db_schema: typeof body?.db_schema === 'string' ? body.db_schema : undefined,
    max_rows: typeof body?.max_rows === 'number' ? body.max_rows : undefined,
    db_extra_search_path:
      typeof body?.db_extra_search_path === 'string' ? body.db_extra_search_path : undefined,
    db_pool: body?.db_pool === null || typeof body?.db_pool === 'number' ? body.db_pool : undefined,
  }

  try {
    const updated = await updateProjectPostgrestConfig({ claims, ref, patch })
    if (!updated) {
      return res.status(404).json({ message: 'Project not found' })
    }
    return res.status(200).json(updated)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update config'
    return res.status(500).json({ message })
  }
}
