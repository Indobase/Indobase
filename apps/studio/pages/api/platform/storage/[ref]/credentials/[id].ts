import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { storageS3AdminFetch } from 'lib/api/storage-platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: { message: 'Credential id is required' } })

  const response = await storageS3AdminFetch(req, claims, `/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}))
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : 'Failed to delete storage credential'
    return res.status(response.status).json({ error: { message } })
  }

  return res.status(204).end()
}
