import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getStoragePlatformClient,
  respondStorageError,
} from 'lib/api/storage-platform'

type TableFields = components['schemas']['CreateNamespaceTableBody']['fields']

function buildIcebergTablePayload(name: string, fields: TableFields) {
  return {
    name,
    schema: {
      type: 'struct',
      fields: fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        required: field.required,
      })),
      'schema-id': 0,
      'identifier-field-ids': fields.filter((field) => field.required).map((field) => field.id),
    },
    'partition-spec': {
      'spec-id': 0,
      fields: [],
    },
    'write-order': {
      'order-id': 0,
      fields: [],
    },
    properties: {
      'write.format.default': 'parquet',
    },
  }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  const bucketId = typeof req.query.id === 'string' ? req.query.id : ''
  const namespaceParam = typeof req.query.namespace === 'string' ? req.query.namespace : ''
  if (!bucketId || !namespaceParam) {
    return res.status(400).json({ error: { message: 'Bucket id and namespace are required' } })
  }

  const namespaceParts = namespaceParam.split('.').filter(Boolean)
  const client = await getStoragePlatformClient(req, claims)
  const catalog = client.storage.analytics.from(bucketId)

  switch (req.method) {
    case 'GET': {
      const { data, error } = await catalog.listTables({ namespace: namespaceParts })
      if (error) return respondStorageError(res, error)

      return res.status(200).json({
        data: (data?.identifiers ?? []).map((identifier) => ({
          name: identifier.name,
          namespace: identifier.namespace,
        })),
      })
    }
    case 'POST': {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      const fields = Array.isArray(req.body?.fields) ? (req.body.fields as TableFields) : null

      if (!name || !fields?.length) {
        return res.status(400).json({ error: { message: 'name and fields are required' } })
      }

      const { data, error } = await catalog.createTable(
        { namespace: namespaceParts },
        buildIcebergTablePayload(name, fields)
      )
      if (error) return respondStorageError(res, error)

      return res.status(201).json(data)
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}
