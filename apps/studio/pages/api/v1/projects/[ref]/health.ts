import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { IS_SAAS } from 'lib/constants'
import { getSaaSProjectServiceHealth } from 'lib/api/saas/project-health'

const DEFAULT_SERVICES = ['auth', 'realtime', 'rest', 'storage', 'db'] as const

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const servicesParam = req.query.services
  const services =
    typeof servicesParam === 'string'
      ? (servicesParam.split(',').filter(Boolean) as (typeof DEFAULT_SERVICES)[number][])
      : Array.isArray(servicesParam)
        ? (servicesParam as (typeof DEFAULT_SERVICES)[number][])
        : [...DEFAULT_SERVICES]

  if (IS_SAAS && claims) {
    try {
      const health = await getSaaSProjectServiceHealth({
        claims: claims as JwtPayload & Record<string, any>,
        ref,
        services: services.length ? services : [...DEFAULT_SERVICES],
      })

      if (!health) {
        return res.status(404).json({ message: 'Project not found' })
      }

      return res.status(200).json(health)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check project health'
      return res.status(500).json({ message })
    }
  }

  return res.status(200).json(
    (services.length ? services : DEFAULT_SERVICES).map((name) => ({
      name,
      status: 'ACTIVE_HEALTHY',
      healthy: true,
    }))
  )
}
