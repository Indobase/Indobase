import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  createThirdPartyAuthIntegration,
  listThirdPartyAuthIntegrations,
} from 'lib/api/saas/third-party-auth'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  switch (req.method) {
    case 'GET': {
      try {
        const list = await listThirdPartyAuthIntegrations({ claims: claims as any, ref })
        return res.status(200).json(list)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(500).json({ message })
      }
    }
    case 'POST': {
      const body = parseBody(req.body)
      if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

      try {
        const created = await createThirdPartyAuthIntegration({
          claims: claims as any,
          ref,
          body: {
            oidc_issuer_url: typeof body?.oidc_issuer_url === 'string' ? body.oidc_issuer_url : undefined,
            jwks_url: typeof body?.jwks_url === 'string' ? body.jwks_url : undefined,
            custom_jwks: body?.custom_jwks,
          },
        })
        return res.status(201).json(created)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(400).json({ message })
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}

function parseBody(body: unknown) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body as string)
  } catch {
    return null
  }
}
