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
  const client = await getStoragePlatformClient(req, claims)
  const nextToken = typeof req.query.nextToken === 'string' ? req.query.nextToken : undefined

  const { data, error } = await client.storage.vectors.listBuckets(
    nextToken ? { nextToken } : {}
  )

  if (error) return respondStorageError(res, error)

  return res.status(200).json({
    vectorBuckets: data?.vectorBuckets ?? [],
    nextToken: data?.nextToken,
  })
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const bucketName =
    typeof req.body?.bucketName === 'string' ? req.body.bucketName.trim() : ''

  if (!bucketName) {
    return res.status(400).json({ error: { message: 'bucketName is required' } })
  }

  const client = await getStoragePlatformClient(req, claims)
  const { error } = await client.storage.vectors.createBucket(bucketName)

  if (error) return respondStorageError(res, error)

  return res.status(200).json({ name: bucketName, vectorBucketName: bucketName })
}
