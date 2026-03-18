import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@supabase/supabase-js'
import { getOrCreateProfile, getProfile, updateProfile } from 'lib/api/self-hosted/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    case 'PATCH':
      return handlePatch(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PATCH'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const profile = await getProfile({ claims: claims as any })
  if (!profile) return res.status(404).json({ message: "User's profile not found" })
  return res.status(200).json(profile)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const profile = await getOrCreateProfile(claims as any)
  return res.status(200).json(profile)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}

  const updated = await updateProfile({
    claims: claims as any,
    updates: {
      username: body?.username,
      first_name: body?.first_name,
      last_name: body?.last_name,
      primary_email: body?.primary_email,
    },
  })

  return res.status(200).json(updated)
}
