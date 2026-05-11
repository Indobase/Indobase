import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { acceptOrganizationInvite } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

  const token = body?.token
  if (typeof token !== 'string' || !token.trim()) return res.status(400).json({ message: 'token is required' })

  await acceptOrganizationInvite({ claims: claims as any, token })
  return res.status(200).json({ ok: true })
}

function safeJson(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

