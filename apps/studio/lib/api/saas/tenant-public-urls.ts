import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL, PROJECT_REST_URL } from 'lib/constants/api'

import { normalizeDataPlaneMode, type DataPlaneMode } from './data-plane-mode'

/**
 * Hostname for `ref.<domain>` tenant routing (Traefik / GoTrue).
 * Prefer SAAS_PUBLIC_DOMAIN (e.g. indobase.in) over the Kong hostname (api.indobase.in)
 * so one wildcard DNS record (*.indobase.in) covers all project APIs.
 */
export function resolvePublicDomainForTenantStack(): string {
  const raw = process.env.SAAS_PUBLIC_DOMAIN?.trim()
  if (raw) {
    const noProto = raw.replace(/^https?:\/\//i, '')
    return noProto.split('/')[0]!.split(':')[0]!
  }
  const u = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '').trim()
  if (u) {
    try {
      const parsed = new URL(u.startsWith('http') ? u : `https://${u}`)
      const host = parsed.hostname
      // Kong lives on api.*; tenant stacks use the registrable domain (indobase.in).
      if (host.startsWith('api.')) return host.slice(4)
    } catch {
      // ignore
    }
  }
  return 'localhost'
}

/**
 * When true, client SDKs should call `https://{ref}.<public-domain>` (per-project Traefik host).
 * Shared-gateway Free tier and legacy Model A use `api.<domain>` with project-scoped keys.
 */
export function usesTenantPublicApiHost(
  hasDedicatedTenantDb: boolean,
  dataPlaneMode?: DataPlaneMode | string | null
): boolean {
  const mode = normalizeDataPlaneMode(
    dataPlaneMode ?? (hasDedicatedTenantDb ? 'isolated_stack' : 'model_a')
  )
  if (mode === 'shared_gateway' || mode === 'model_a') return false
  return hasDedicatedTenantDb
}

/** Base API URL for Connect / env snippets (`https://ref.indobase.in`, no path suffix). */
export function resolveSaaSTenantApiBaseUrl(
  ref: string,
  hasDedicatedTenantDb: boolean,
  dataPlaneMode?: DataPlaneMode | string | null
): string {
  const { endpointHost, protocol } = resolveSaaSTenantRestUrls(
    ref,
    hasDedicatedTenantDb,
    dataPlaneMode
  )
  return `${protocol}://${endpointHost}`
}

/** REST + API host for Studio clients: isolated stack → `ref.<domain>`; shared gateway → Kong. */
export function resolveSaaSTenantRestUrls(
  ref: string,
  hasDedicatedTenantDb: boolean,
  dataPlaneMode?: DataPlaneMode | string | null
) {
  if (!usesTenantPublicApiHost(hasDedicatedTenantDb, dataPlaneMode)) {
    return {
      endpointHost: PROJECT_ENDPOINT,
      restUrl: PROJECT_REST_URL,
      protocol: PROJECT_ENDPOINT_PROTOCOL,
    }
  }
  const domain = resolvePublicDomainForTenantStack().trim() || 'localhost'
  const tls = domain !== 'localhost' && domain !== '127.0.0.1'
  const protocol = tls ? 'https' : 'http'
  const endpointHost = `${ref}.${domain}`
  const restUrl = `${protocol}://${endpointHost}/rest/v1/`
  return { endpointHost, restUrl, protocol }
}
