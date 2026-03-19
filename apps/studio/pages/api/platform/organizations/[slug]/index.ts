import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@supabase/supabase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteOrganization,
  getOrganization,
  updateOrganization,
} from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) {
  const { method } = req
  const { slug } = req.query

  if (typeof slug !== 'string' || !slug) {
    return res.status(400).json({ message: 'Organization slug is required' })
  }

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims, slug)
    case 'PATCH':
      return handlePatch(req, res, claims, slug)
    case 'DELETE':
      return handleDelete(req, res, claims, slug)
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
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

const handleGet = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload | undefined,
  slug: string
) => {
  const org = await getOrganization({ claims: claims as any, slug })
  if (!org) return res.status(404).json({ message: 'Organization not found' })
  return res.status(200).json(org)
}

const handlePatch = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload | undefined,
  slug: string
) => {
  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

  const org = await updateOrganization({
    claims: claims as any,
    slug,
    updates: {
      name: body?.name,
      billing_email: body?.billing_email,
      opt_in_tags: body?.opt_in_tags,
    },
  })

  if (!org) return res.status(404).json({ message: 'Organization not found' })
  return res.status(200).json(org)
}

const handleDelete = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload | undefined,
  slug: string
) => {
  const ok = await deleteOrganization({ claims: claims as any, slug })
  if (!ok) return res.status(404).json({ message: 'Organization not found' })
  return res.status(200).end()
}

