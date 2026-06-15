import { resolvePublicDomainForTenantStack } from './tenant-public-urls'

async function pingUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal })
    return (
      response.ok ||
      response.status === 401 ||
      response.status === 404 ||
      response.status === 400
    )
  } catch {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeoutMs)
          : undefined
      const response = await fetch(url, { method: 'GET', cache: 'no-store', signal })
      return response.ok || response.status === 401 || response.status === 404
    } catch {
      return false
    }
  }
}

function traefikUpstreamHost(): string {
  return process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
}

/** True when tenant REST + Auth respond (internal ports or public hostname). */
export async function isTenantDataPlaneReachable(
  ref: string,
  portBase?: number | null
): Promise<boolean> {
  if (typeof portBase === 'number' && Number.isFinite(portBase) && portBase >= 1024) {
    const host = traefikUpstreamHost()
    const [rest, auth] = await Promise.all([
      pingUrl(`http://${host}:${portBase + 1}/`),
      pingUrl(`http://${host}:${portBase + 2}/health`),
    ])
    if (rest && auth) return true
  }

  const domain = resolvePublicDomainForTenantStack()
  if (!domain || domain === 'localhost') return false

  const origin = `https://${ref}.${domain}`
  const [rest, auth] = await Promise.all([
    pingUrl(`${origin}/rest/v1/`),
    pingUrl(`${origin}/auth/v1/health`),
  ])
  return rest && auth
}
