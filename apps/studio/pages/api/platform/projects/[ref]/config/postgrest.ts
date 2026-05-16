import type { JwtPayload } from 'indobase-js'
import { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { loadProjectJwtSecretEncForMember, resolveProjectJwtSecret } from 'lib/api/saas/project-jwt'
import { getGotrueUserId } from 'lib/api/saas/platform'
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
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''

  let jwt_secret =
    process.env.AUTH_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

  if (IS_SAAS && claims && ref) {
    try {
      const gotrueId = getGotrueUserId(claims)
      const loaded = await loadProjectJwtSecretEncForMember({ projectRef: ref, gotrueId })
      if (loaded) {
        jwt_secret = resolveProjectJwtSecret(loaded.jwtSecretEnc)
      } else {
        return res.status(404).json({
          data: null,
          error: { message: 'Project not found' },
        } as never)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load JWT secret'
      return res.status(500).json({ data: null, error: { message } } as never)
    }
  }

  const responseObj: components['schemas']['GetPostgrestConfigResponse'] = {
    db_anon_role: 'anon',
    db_extra_search_path: 'public',
    db_schema: 'public, storage',
    jwt_secret,
    max_rows: 100,
    role_claim_key: '.role',
  }

  return res.status(200).json(responseObj)
}
