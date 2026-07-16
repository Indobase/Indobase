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

  const bucketId = typeof req.query.id === 'string' ? req.query.id : ''
  const namespaceParam = typeof req.query.namespace === 'string' ? req.query.namespace : ''
  const table = typeof req.query.table === 'string' ? req.query.table : ''
  const purge = req.query.purge === 'true' || req.query.purge === true

  if (!bucketId || !namespaceParam || !table) {
    return res
      .status(400)
      .json({ error: { message: 'Bucket id, namespace, and table are required' } })
  }

  const namespaceParts = namespaceParam.split('.').filter(Boolean)
  const client = await getStoragePlatformClient(req, claims)
  const { error } = await client.storage.analytics.from(bucketId).dropTable(
    { namespace: namespaceParts, name: table },
    { purge }
  )

  if (error) return respondStorageError(res, error)

  return res.status(200).json({ message: 'Successfully deleted' })
}
