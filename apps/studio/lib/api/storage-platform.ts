import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
  getProjectPublicApiOrigin,
  getStorageAdminClientFromRequest,
  parseProjectRefFromRequest,
} from 'lib/api/storage-admin'
import { getProjectSettingsForRef } from 'lib/api/saas/settings'

type StorageLikeError = { message: string; status?: number; statusCode?: number }

export function storageErrorStatus(error: StorageLikeError, fallback = 400) {
  const code = error.status ?? error.statusCode
  if (typeof code === 'number' && code >= 400 && code < 600) return code
  return fallback
}

export function respondStorageError(res: NextApiResponse, error: StorageLikeError) {
  const status = storageErrorStatus(error)
  return res.status(status).json({ error: { message: error.message } })
}

export async function getStoragePlatformClient(
  req: Pick<NextApiRequest, 'query'>,
  claims?: JwtPayload
) {
  return getStorageAdminClientFromRequest(req, claims)
}

export async function getStoragePlatformContext(
  req: Pick<NextApiRequest, 'query'>,
  claims?: JwtPayload
) {
  const ref = parseProjectRefFromRequest(req)
  if (!ref || !claims) {
    throw new Error('Project ref and authentication are required')
  }

  const [client, origin, settings] = await Promise.all([
    getStorageAdminClientFromRequest(req, claims),
    getProjectPublicApiOrigin(req, claims),
    getProjectSettingsForRef({ claims, ref }),
  ])

  if (!origin) {
    throw new Error(`Project API URL is missing for ${ref}`)
  }

  const serviceKey = settings?.service_api_keys?.find((entry) => entry.tags === 'service_role')
    ?.api_key

  if (!serviceKey) {
    throw new Error('Project service_role key is missing')
  }

  return { ref, client, origin, serviceKey }
}

export async function storageS3AdminFetch(
  req: Pick<NextApiRequest, 'query'>,
  claims: JwtPayload | undefined,
  path: string,
  init?: RequestInit
) {
  const { ref, origin, serviceKey } = await getStoragePlatformContext(req, claims)
  const url = `${origin.replace(/\/$/, '')}/s3/${encodeURIComponent(ref)}${path}`

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  return response
}
