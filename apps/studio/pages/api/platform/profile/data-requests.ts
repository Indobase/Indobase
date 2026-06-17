import type { NextApiRequest, NextApiResponse } from 'next'

import type { DataPrincipalRequestType } from 'common'
import apiWrapper from 'lib/api/apiWrapper'
import type { JwtPayload } from '@indobaseinc/indobase-js'
import {
  createDataPrincipalRequest,
  listDataPrincipalRequests,
} from 'lib/api/saas/data-principal'

const ALLOWED_TYPES: DataPrincipalRequestType[] = [
  'access',
  'correction',
  'erasure',
  'grievance',
  'nominate',
  'consent_withdrawal',
]

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  res.setHeader('Cache-Control', 'no-store')

  switch (req.method) {
    case 'GET':
      return handleGet(res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}

async function handleGet(res: NextApiResponse, claims?: JwtPayload) {
  const rows = await listDataPrincipalRequests(claims as any)
  return res.status(200).json({ data: rows })
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  let body: Record<string, unknown> = {}
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body)
    } catch {
      return res.status(400).json({ error: { message: 'Invalid JSON body' } })
    }
  } else {
    body = (req.body ?? {}) as Record<string, unknown>
  }

  const requestType = body.request_type as DataPrincipalRequestType | undefined
  if (!requestType || !ALLOWED_TYPES.includes(requestType)) {
    return res.status(400).json({
      error: {
        message: `request_type is required and must be one of: ${ALLOWED_TYPES.join(', ')}`,
      },
    })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (requestType === 'grievance' && message.length < 10) {
    return res.status(400).json({
      error: { message: 'Grievance requests require a message of at least 10 characters.' },
    })
  }

  const row = await createDataPrincipalRequest({
    claims: claims as any,
    requestType,
    message: message || null,
  })

  return res.status(201).json({ data: row })
}
