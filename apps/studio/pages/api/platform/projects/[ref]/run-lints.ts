import type { JwtPayload } from 'indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { getLints } from 'lib/api/saas/lints'
import {
  DEFAULT_POSTGREST_DB_SCHEMA,
  resolvePostgrestDbSchemaForProject,
} from 'lib/api/saas/postgrest-config'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: IS_SAAS })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET': {
      const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
      let exposedSchemas = DEFAULT_POSTGREST_DB_SCHEMA
      if (IS_SAAS && claims && ref) {
        try {
          exposedSchemas = await resolvePostgrestDbSchemaForProject({ claims, ref })
        } catch {
          // fall back to default schema list
        }
      }

      const { data, error } = await getLints({
        headers: constructHeaders(req.headers),
        exposedSchemas,
      })

      if (error) {
        return res.status(400).json(error)
      } else {
        return res.status(200).json(data)
      }
    }
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}
