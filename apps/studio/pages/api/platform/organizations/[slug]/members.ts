import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  addOrganizationMember,
  listOrganizationMembers,
  removeOrganizationMember,
} from 'lib/api/saas/platform'

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
    case 'DELETE':
      return handleDelete(req, res, claims, slug)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
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
  const members = await listOrganizationMembers({ claims: claims as any, slug })
  return res.status(200).json({ members })
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload | undefined, slug: string) => {
  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

  const member_gotrue_id = body?.member_gotrue_id
  const role = body?.role
  if (typeof member_gotrue_id !== 'string' || !member_gotrue_id) {
    return res.status(400).json({ message: 'member_gotrue_id is required' })
  }
  if (!['owner', 'admin', 'developer', 'viewer'].includes(role)) {
    return res.status(400).json({ message: "role must be one of 'owner','admin','developer','viewer'" })
  }

  await addOrganizationMember({
    claims: claims as any,
    slug,
    member_gotrue_id,
    role,
  })
  return res.status(200).json({ ok: true })
}

const handleDelete = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload | undefined,
  slug: string
) => {
  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
  const member_gotrue_id = body?.member_gotrue_id
  if (typeof member_gotrue_id !== 'string' || !member_gotrue_id) {
    return res.status(400).json({ message: 'member_gotrue_id is required' })
  }
  await removeOrganizationMember({ claims: claims as any, slug, member_gotrue_id })
  return res.status(200).json({ ok: true })
}

