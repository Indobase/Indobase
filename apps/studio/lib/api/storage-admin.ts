import type { JwtPayload } from '@indobaseinc/indobase-js'
import { createClient, type IndobaseClient } from '@indobaseinc/indobase-js'
import type { NextApiRequest } from 'next'

import { getProjectSettingsForRef } from 'lib/api/saas/settings'

/**
 * Creates a service-role Supabase client for the SaaS Studio backend.
 *
 * Module-scope `createClient(...)` calls were causing every request through
 * the storage / auth proxy handlers to 500 when one of the env vars was
 * temporarily unset (Next.js evaluates the module the first time the route
 * is imported). Calling this lazily inside the request handler gives a clear
 * 503 instead, and lets us reuse the client across handlers in the same
 * process.
 *
 * Dedicated-tenant projects must use `{ref}.<public-domain>` (per-tenant storage),
 * not the shared Kong `SUPABASE_URL` stub — the central storage container uses a
 * different Postgres role/password and returns 500 for bucket APIs.
 */
let cachedDefaultClient: IndobaseClient | null = null
const cachedByRef = new Map<string, IndobaseClient>()

function normalizeApiOrigin(protocol: string | undefined, endpoint: string | undefined) {
  const proto = (protocol || 'https').replace(/:$/, '')
  const host = (endpoint || '').trim()
  if (!host) return ''
  return `${proto}://${host}`
}

function getServiceKeyFromSettings(settings: NonNullable<Awaited<ReturnType<typeof getProjectSettingsForRef>>>) {
  const key = settings.service_api_keys?.find((entry) => entry.tags === 'service_role')?.api_key?.trim()
  if (!key) {
    throw new Error('Project service_role key is missing')
  }
  return key
}

export function getStorageAdminClient(): IndobaseClient {
  if (cachedDefaultClient) return cachedDefaultClient

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!url) {
    throw new Error(
      'SUPABASE_URL is not set on Studio. Set it to your Kong base URL (e.g. http://indobase-kong:8000).'
    )
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_KEY is not set on Studio. Set it to your service-role JWT (must match the JWT_SECRET used by GoTrue).'
    )
  }

  cachedDefaultClient = createClient(url, serviceKey)
  return cachedDefaultClient
}

export async function getStorageAdminClientForRef(
  ref: string,
  claims: JwtPayload
): Promise<IndobaseClient> {
  const cached = cachedByRef.get(ref)
  if (cached) return cached

  const settings = await getProjectSettingsForRef({ claims, ref })
  if (!settings) {
    throw new Error(`Project not found: ${ref}`)
  }

  const url = normalizeApiOrigin(settings.app_config?.protocol, settings.app_config?.endpoint)
  if (!url) {
    throw new Error(`Project API URL is missing for ${ref}`)
  }

  const serviceKey = getServiceKeyFromSettings(settings)
  const client = createClient(url, serviceKey)
  cachedByRef.set(ref, client)
  return client
}

export function parseProjectRefFromRequest(req: Pick<NextApiRequest, 'query'>): string | undefined {
  const refRaw = req.query.ref
  return Array.isArray(refRaw) ? refRaw[0] : refRaw
}

/**
 * Resolves the storage/admin Supabase client for a platform API route.
 * When `[ref]` is present and the user is authenticated, uses the project's
 * tenant API host and service_role key.
 */
export async function getStorageAdminClientFromRequest(
  req: Pick<NextApiRequest, 'query'>,
  claims?: JwtPayload
): Promise<IndobaseClient> {
  const ref = parseProjectRefFromRequest(req)
  if (ref && claims) {
    return getStorageAdminClientForRef(ref, claims)
  }
  return getStorageAdminClient()
}

/** Public API origin for signed/public storage URLs (tenant host when `[ref]` is set). */
export async function getProjectPublicApiOrigin(
  req: Pick<NextApiRequest, 'query'>,
  claims?: JwtPayload
): Promise<string | undefined> {
  const ref = parseProjectRefFromRequest(req)
  if (ref && claims) {
    const settings = await getProjectSettingsForRef({ claims, ref })
    if (settings) {
      const origin = normalizeApiOrigin(settings.app_config?.protocol, settings.app_config?.endpoint)
      if (origin) return origin
    }
  }
  return process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
}
