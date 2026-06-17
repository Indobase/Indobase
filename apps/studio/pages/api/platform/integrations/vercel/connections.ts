import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { components } from 'api-types'
import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { createVercelConnection } from 'lib/api/saas/vercel-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type GetResponse =
  paths['/platform/integrations/vercel/connections']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  switch (req.method) {
    case 'GET':
      return res.status(200).json({ connections: [] } satisfies GetResponse)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload) => {
  const raw = req.body
  const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as components['schemas']['CreateVercelConnectionsBody']

  try {
    const created = await createVercelConnection({ claims: claims as any, body })
    return res.status(201).json(created)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Vercel connection'
    return res.status(400).json({ message })
  }
}
