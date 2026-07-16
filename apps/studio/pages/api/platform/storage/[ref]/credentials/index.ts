import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { storageS3AdminFetch } from 'lib/api/storage-platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const response = await storageS3AdminFetch(req, claims, '/credentials', { method: 'GET' })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : 'Failed to list storage credentials'
    return res.status(response.status).json({ error: { message } })
  }

  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []

  return res.status(200).json({
    data: rows.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      description: String(row.description ?? ''),
      created_at: String(row.created_at ?? new Date().toISOString()),
      access_key: typeof row.access_key === 'string' ? row.access_key : undefined,
    })),
  })
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : ''

  if (!description) {
    return res.status(400).json({ error: { message: 'description is required' } })
  }

  const response = await storageS3AdminFetch(req, claims, '/credentials', {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : 'Failed to create storage credential'
    return res.status(response.status).json({ error: { message } })
  }

  return res.status(201).json({
    id: String(payload.id ?? ''),
    description: String(payload.description ?? description),
    access_key: String(payload.access_key ?? ''),
    secret_key: String(payload.secret_key ?? ''),
  })
}
