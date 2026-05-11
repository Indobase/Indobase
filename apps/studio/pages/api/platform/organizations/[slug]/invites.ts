import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { createOrganizationInvite, listOrganizationInvites } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req
  const { slug } = req.query
  if (typeof slug !== 'string' || !slug) return res.status(400).json({ message: 'Organization slug is required' })

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims, slug)
    case 'POST':
      return handlePost(req, res, claims, slug)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${method} Not Allowed` })
  }
}

const parseRequestBody = (body: NextApiRequest['body']) => {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const handleGet = async (_req: NextApiRequest, res: NextApiResponse, claims: JwtPayload | undefined, slug: string) => {
  const invites = await listOrganizationInvites({ claims: claims as any, slug })
  return res.status(200).json({ invites })
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload | undefined, slug: string) => {
  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

  const email = body?.email
  const role = body?.role
  if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ message: 'email is required' })
  if (!['admin', 'developer', 'viewer'].includes(role)) {
    return res.status(400).json({ message: "role must be one of 'admin','developer','viewer'" })
  }

  const invite = await createOrganizationInvite({ claims: claims as any, slug, email, role })
  return res.status(200).json(invite)
}

