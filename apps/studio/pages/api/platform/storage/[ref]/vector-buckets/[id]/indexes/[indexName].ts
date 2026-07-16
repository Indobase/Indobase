import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getStoragePlatformClient,
  respondStorageError,
} from 'lib/api/storage-platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  const bucketName = typeof req.query.id === 'string' ? req.query.id : ''
  const indexName = typeof req.query.indexName === 'string' ? req.query.indexName : ''

  if (!bucketName || !indexName) {
    return res.status(400).json({ error: { message: 'Bucket id and indexName are required' } })
  }

  const client = await getStoragePlatformClient(req, claims)
  const { error } = await client.storage.vectors.from(bucketName).deleteIndex(indexName)

  if (error) return respondStorageError(res, error)

  return res.status(200).json({ name: indexName, indexName })
}
