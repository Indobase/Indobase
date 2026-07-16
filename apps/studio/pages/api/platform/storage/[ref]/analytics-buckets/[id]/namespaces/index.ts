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

  const bucketId = typeof req.query.id === 'string' ? req.query.id : ''
  if (!bucketId) return res.status(400).json({ error: { message: 'Bucket id is required' } })

  const client = await getStoragePlatformClient(req, claims)
  const catalog = client.storage.analytics.from(bucketId)

  switch (req.method) {
    case 'GET': {
      const { data, error } = await catalog.listNamespaces()
      if (error) return respondStorageError(res, error)

      return res.status(200).json({
        data: (data?.namespaces ?? []).map((namespace) => ({
          namespace: Array.isArray(namespace) ? namespace : [namespace],
        })),
      })
    }
    case 'POST': {
      const namespaceName =
        typeof req.body?.namespace === 'string' ? req.body.namespace.trim() : ''
      if (!namespaceName) {
        return res.status(400).json({ error: { message: 'namespace is required' } })
      }

      const namespaceParts = namespaceName.split('.').filter(Boolean)
      const { error } = await catalog.createNamespace({ namespace: namespaceParts })
      if (error) return respondStorageError(res, error)

      return res.status(201).json({ namespace: namespaceParts })
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}
