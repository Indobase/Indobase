import type { JwtPayload } from 'indobase-js'
import { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getProjectPostgrestConfig,
  updateProjectPostgrestConfig,
} from 'lib/api/saas/postgrest-config'
import { IS_SAAS } from 'lib/constants'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: IS_SAAS })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'PATCH':
      return handlePatch(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'PATCH'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!IS_SAAS || !claims || !ref) {
    const responseObj: components['schemas']['GetPostgrestConfigResponse'] = {
      db_anon_role: 'anon',
      db_extra_search_path: 'public',
      db_schema: 'public, storage',
      jwt_secret:
        process.env.AUTH_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long',
      max_rows: 100,
      role_claim_key: '.role',
    }
    return res.status(200).json(responseObj)
  }

  try {
    const config = await getProjectPostgrestConfig({ claims, ref })
    if (!config) {
      return res.status(404).json({
        data: null,
        error: { message: 'Project not found' },
      } as never)
    }
    return res.status(200).json(config)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load PostgREST config'
    return res.status(500).json({ data: null, error: { message } } as never)
  }
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!IS_SAAS || !claims || !ref) {
    return res.status(200).json({})
  }

  let body: components['schemas']['UpdatePostgrestConfigBody'] | undefined
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
      | components['schemas']['UpdatePostgrestConfigBody']
      | undefined
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  try {
    const updated = await updateProjectPostgrestConfig({
      claims,
      ref,
      patch: body ?? {},
    })
    if (!updated) {
      return res.status(404).json({ message: 'Project not found' })
    }
    return res.status(200).json(updated)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update PostgREST config'
    return res.status(500).json({ message })
  }
}
