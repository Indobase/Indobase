import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

import type { JwtPayload } from '@supabase/supabase-js'
import { createOrganization, listOrganizations } from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  claims?: JwtPayload
) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
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

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  try {
    return res.status(200).json(
      await listOrganizations({
        claims: claims as any,
      })
    )
  } catch (error: any) {
    return res.status(500).json({ message: error?.message ?? 'Failed to list organizations' })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  try {
    const body = parseRequestBody(req.body)
    if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
    return res.status(200).json(
      await createOrganization({
        claims: claims as any,
        body,
      })
    )
  } catch (error: any) {
    return res.status(400).json({ message: error?.message ?? 'Failed to create organization' })
  }
}
