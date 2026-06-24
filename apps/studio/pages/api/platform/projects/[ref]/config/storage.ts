import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getProjectStorageConfig,
  updateProjectStorageConfig,
} from 'lib/api/saas/project-storage-config'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  if (!IS_SAAS) {
    return res.status(501).json({ message: 'Storage configuration is only supported in SaaS mode' })
  }

  switch (req.method) {
    case 'GET': {
      try {
        const config = await getProjectStorageConfig({ claims, ref })
        return res.status(200).json(config)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load storage config'
        const status = /not found/i.test(message) ? 404 : 500
        return res.status(status).json({ message })
      }
    }
    case 'PATCH': {
      let body: components['schemas']['UpdateStorageConfigBody']
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
      } catch {
        return res.status(400).json({ message: 'Invalid JSON body' })
      }

      try {
        const config = await updateProjectStorageConfig({ claims, ref, patch: body })
        return res.status(200).json(config)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update storage config'
        const status = /not found/i.test(message) ? 404 : 500
        return res.status(status).json({ message })
      }
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH'])
      return res.status(405).json({ message: 'Method not allowed' })
  }
}
