import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@supabase/supabase-js'
import { getTenantStackArtifacts } from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref } = req.query
  if (typeof ref !== 'string' || !ref) return res.status(400).json({ message: 'Project ref is required' })

  const publicDomainRaw = req.query.public_domain
  const publicDomain =
    typeof publicDomainRaw === 'string' && publicDomainRaw.trim()
      ? publicDomainRaw.trim()
      : process.env.PUBLIC_DOMAIN || ''

  if (!publicDomain) {
    return res.status(400).json({
      message:
        'public_domain is required (either ?public_domain=example.com or set PUBLIC_DOMAIN in env for Studio)',
    })
  }

  const artifacts = await getTenantStackArtifacts({ claims: claims as any, ref, publicDomain })
  if (!artifacts) return res.status(404).json({ message: 'Project not found' })

  return res.status(200).json(artifacts)
}

