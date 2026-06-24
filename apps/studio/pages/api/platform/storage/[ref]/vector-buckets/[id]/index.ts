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

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: { message: 'Bucket id is required' } })

  const client = await getStoragePlatformClient(req, claims)

  switch (req.method) {
    case 'GET': {
      const { data, error } = await client.storage.vectors.getBucket(id)
      if (error) return respondStorageError(res, error)
      return res.status(200).json({
        vectorBucketName: data?.vectorBucket?.vectorBucketName ?? id,
        creationTime: data?.vectorBucket?.creationTime,
      })
    }
    case 'DELETE': {
      const { error } = await client.storage.vectors.deleteBucket(id)
      if (error) return respondStorageError(res, error)
      return res.status(200).json({ name: id, vectorBucketName: id })
    }
    default:
      res.setHeader('Allow', ['GET', 'DELETE'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}
