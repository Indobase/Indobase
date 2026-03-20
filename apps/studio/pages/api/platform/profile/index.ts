import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@supabase/supabase-js'
import { getOrCreateProfile, getProfile, updateProfile } from 'lib/api/self-hosted/platform'

const proxyTarget = process.env.PLATFORM_API_PROXY

const proxyRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!proxyTarget) return false
  const targetUrl = `${proxyTarget}${req.url?.replace(/^\/api/, '') ?? ''}`
  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => {
    if (typeof value === 'string') headers.set(key, value)
  })
  const body =
    req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  })
  res.status(response.status)
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return
    res.setHeader(key, value)
  })
  const text = await response.text()
  res.send(text)
  return true
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      if (await proxyRequest(req, res)) return
      return handleGet(req, res, claims)
    case 'POST':
      if (await proxyRequest(req, res)) return
      return handlePost(req, res, claims)
    case 'PATCH':
      if (await proxyRequest(req, res)) return
      return handlePatch(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PATCH'])
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

const handleGet = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const profile = await getProfile(claims as any)
  if (!profile) return res.status(404).json({ message: "User's profile not found" })
  return res.status(200).json(profile)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const profile = await getOrCreateProfile(claims as any)
  return res.status(200).json(profile)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  const body = parseRequestBody(req.body)
  if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })

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
