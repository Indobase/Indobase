import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL, PROJECT_REST_URL } from 'lib/constants/api'

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
 * When true, client SDKs should call `https://{ref}.<public-domain>` (per-project Traefik host),
 * matching Supabase's `{ref}.supabase.co`. Requires a dedicated tenant DB; shared Kong uses
 * `api.<domain>` plus project-scoped anon/service keys.
 */
export function usesTenantPublicApiHost(hasDedicatedTenantDb: boolean): boolean {
  return hasDedicatedTenantDb
}

/** Base API URL for Connect / env snippets (`https://ref.indobase.in`, no path suffix). */
export function resolveSaaSTenantApiBaseUrl(ref: string, hasDedicatedTenantDb: boolean): string {
  const { endpointHost, protocol } = resolveSaaSTenantRestUrls(ref, hasDedicatedTenantDb)
  return `${protocol}://${endpointHost}`
}

/** REST + API host for Studio clients: dedicated DB → `ref.<public domain>`; else shared Kong (`PROJECT_*`). */
export function resolveSaaSTenantRestUrls(ref: string, hasDedicatedTenantDb: boolean) {
  if (!usesTenantPublicApiHost(hasDedicatedTenantDb)) {
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
