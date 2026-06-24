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

  const bucketName = typeof req.query.id === 'string' ? req.query.id : ''
  if (!bucketName) {
    return res.status(400).json({ error: { message: 'Bucket id is required' } })
  }

  const client = await getStoragePlatformClient(req, claims)
  const bucket = client.storage.vectors.from(bucketName)

  switch (req.method) {
    case 'GET': {
      const nextToken = typeof req.query.nextToken === 'string' ? req.query.nextToken : undefined
      const { data, error } = await bucket.listIndexes(nextToken ? { nextToken } : {})
      if (error) return respondStorageError(res, error)
      return res.status(200).json({
        indexes: data?.indexes ?? [],
        nextToken: data?.nextToken,
      })
    }
    case 'POST': {
      const { indexName, dimension, distanceMetric, metadataKeys } = req.body ?? {}
      if (!indexName || !dimension || !distanceMetric) {
        return res.status(400).json({
          error: { message: 'indexName, dimension, and distanceMetric are required' },
        })
      }

      const { error } = await bucket.createIndex({
        indexName,
        dataType: 'float32',
        dimension: Number(dimension),
        distanceMetric,
        ...(Array.isArray(metadataKeys)
          ? {
              metadataConfiguration: {
                nonFilterableMetadataKeys: metadataKeys,
              },
            }
          : {}),
      })

      if (error) return respondStorageError(res, error)
      return res.status(200).json({ name: indexName, indexName })
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}
