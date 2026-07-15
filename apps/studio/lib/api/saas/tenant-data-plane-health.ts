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
      response.status === 400 ||
      // GoTrue /health often returns 405 on HEAD while GET succeeds.
      response.status === 405
    )
  } catch {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeoutMs)
          : undefined
      const response = await fetch(url, { method: 'GET', cache: 'no-store', signal })
      return response.ok || response.status === 401 || response.status === 404 || response.status === 405
    } catch {
      return false
    }
  }
}

function traefikUpstreamHost(): string {
  return process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
}

/**
 * Dual-VPS: tenant ports bind on the data-plane host (e.g. 172.17.0.1 on .248).
 * Studio on the control plane cannot reach those ports — ask the provisioner instead.
 */
async function pingViaProvisioner(ref: string): Promise<boolean | null> {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) return null

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(12_000)
        : undefined
    const response = await fetch(`${provisionerUrl}/stack-health`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provisionerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project_ref: ref }),
      signal,
      cache: 'no-store',
    })
    // Older provisioners may not expose /stack-health yet — fall back to local probes.
    if (response.status === 404) return null
    if (!response.ok) return false
    const body = (await response.json().catch(() => null)) as { ok?: boolean } | null
    return body?.ok === true
  } catch {
    // Network/auth errors: don't permanently block promotion on dual-VPS blips — try local/public next.
    return null
  }
}

/** True when tenant REST + Auth respond (provisioner, internal ports, or public hostname). */
export async function isTenantDataPlaneReachable(
  ref: string,
  portBase?: number | null
): Promise<boolean> {
  const viaProvisioner = await pingViaProvisioner(ref)
  if (viaProvisioner === true) return true
  // Only fall back when provisioner is not configured — a definitive false means unhealthy.
  if (viaProvisioner === false) return false

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
