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
  const { limit, offset, search, sortColumn, sortOrder } = req.query

  const { data, error } = await client.storage.analytics.listBuckets({
    ...(typeof limit === 'string' ? { limit: Number(limit) } : {}),
    ...(typeof offset === 'string' ? { offset: Number(offset) } : {}),
    ...(typeof search === 'string' ? { search } : {}),
    ...(sortColumn === 'name' || sortColumn === 'created_at' || sortColumn === 'updated_at'
      ? { sortColumn }
      : {}),
    ...(sortOrder === 'asc' || sortOrder === 'desc' ? { sortOrder } : {}),
  })

  if (error) return respondStorageError(res, error)

  return res.status(200).json({
    data: (data ?? []).map((bucket) => ({
      name: bucket.name,
      created_at: bucket.created_at,
      updated_at: bucket.updated_at,
    })),
  })
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const bucketName =
    typeof req.body?.bucketName === 'string' ? req.body.bucketName.trim() : ''

  if (!bucketName) {
    return res.status(400).json({ error: { message: 'bucketName is required' } })
  }

  const client = await getStoragePlatformClient(req, claims)
  const { data, error } = await client.storage.analytics.createBucket(bucketName)

  if (error) return respondStorageError(res, error)

  return res.status(201).json({
    name: data?.name ?? bucketName,
    created_at: data?.created_at ?? new Date().toISOString(),
    updated_at: data?.updated_at ?? new Date().toISOString(),
  })
}
