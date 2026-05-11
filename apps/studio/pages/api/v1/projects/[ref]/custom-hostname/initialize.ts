import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { initializeCustomDomain } from 'lib/api/saas/custom-domains'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const body = parseBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
  const customHostname = body?.custom_hostname
  if (typeof customHostname !== 'string' || !customHostname.trim()) {
    return res.status(400).json({ message: 'custom_hostname is required' })
  }

  try {
    const result = await initializeCustomDomain({
      claims: claims as any,
      ref,
      hostname: customHostname,
    })
    return res.status(201).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(400).json({ message })
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
