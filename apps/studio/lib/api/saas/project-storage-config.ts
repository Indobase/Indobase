import type { components } from 'api-types'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import { defaultStorageConfigResponse } from 'lib/api/saas/platform-stubs'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>
type StorageConfigResponse = components['schemas']['StorageConfigResponse']
type UpdateStorageConfigBody = components['schemas']['UpdateStorageConfigBody']

function mergeStorageConfig(
  stored: Partial<StorageConfigResponse> | null | undefined
): StorageConfigResponse {
  const defaults = defaultStorageConfigResponse()
  if (!stored || typeof stored !== 'object') return defaults

  return {
    ...defaults,
    ...stored,
    capabilities: { ...defaults.capabilities, ...(stored.capabilities ?? {}) },
    external: { ...defaults.external, ...(stored.external ?? {}) },
    features: {
      icebergCatalog: {
        ...defaults.features.icebergCatalog,
        ...(stored.features?.icebergCatalog ?? {}),
      },
      imageTransformation: {
        ...defaults.features.imageTransformation,
        ...(stored.features?.imageTransformation ?? {}),
      },
      s3Protocol: {
        ...defaults.features.s3Protocol,
        ...(stored.features?.s3Protocol ?? {}),
      },
      vectorBuckets: {
        ...defaults.features.vectorBuckets,
        ...(stored.features?.vectorBuckets ?? {}),
      },
    },
    fileSizeLimit: stored.fileSizeLimit ?? defaults.fileSizeLimit,
  }
}

export async function getProjectStorageConfig({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<StorageConfigResponse> {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)

  const result = await executeQuery<{ storage_config: StorageConfigResponse | null }>({
    query: `select storage_config from saas.projects where ref = $1 limit 1`,
    parameters: [ref],
    actorId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('Project not found')

  return mergeStorageConfig(result.data[0].storage_config)
}

export async function updateProjectStorageConfig({
  claims,
  patch,
  ref,
}: {
  claims: Claims
  patch: UpdateStorageConfigBody
  ref: string
}): Promise<StorageConfigResponse> {
  const current = await getProjectStorageConfig({ claims, ref })

  const next = mergeStorageConfig({
    ...current,
    fileSizeLimit: patch.fileSizeLimit ?? current.fileSizeLimit,
    external: patch.external ? { ...current.external, ...patch.external } : current.external,
    features: {
      icebergCatalog: patch.features?.icebergCatalog
        ? { ...current.features.icebergCatalog, ...patch.features.icebergCatalog }
        : current.features.icebergCatalog,
      imageTransformation: patch.features?.imageTransformation
        ? { ...current.features.imageTransformation, ...patch.features.imageTransformation }
        : current.features.imageTransformation,
      s3Protocol: patch.features?.s3Protocol
        ? { ...current.features.s3Protocol, ...patch.features.s3Protocol }
        : current.features.s3Protocol,
      vectorBuckets: patch.features?.vectorBuckets
        ? { ...current.features.vectorBuckets, ...patch.features.vectorBuckets }
        : current.features.vectorBuckets,
    },
  })

  const actorId = getGotrueUserId(claims)
  const result = await executeQuery<{ storage_config: StorageConfigResponse }>({
    query: `
      update saas.projects
      set storage_config = $2::jsonb
      where ref = $1
      returning storage_config
    `,
    parameters: [ref, JSON.stringify(next)],
    actorId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('Project not found')

  return mergeStorageConfig(result.data[0].storage_config)
}
