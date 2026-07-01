function isRemoteDataPlaneProvisioner(): boolean {
  const url = process.env.DATA_PLANE_PROVISIONER_URL?.trim() || ''
  if (!url) return false

  try {
    const hostname = new URL(url).hostname
    return !['localhost', '127.0.0.1', 'data-plane-provisioner', 'indobase-data-plane-provisioner'].includes(
      hostname,
    )
  } catch {
    return !url.includes('localhost') && !url.includes('127.0.0.1')
  }
}

/** Postgres endpoint tenant stacks on the backend VPS should use (dual-VPS). */
export function resolveRemoteDataPlanePgEndpoint(): { host: string; port: string } | null {
  const explicitHost =
    process.env.SAAS_DATA_PLANE_PG_HOST?.trim() || process.env.PROVISIONER_PG_HOST?.trim() || ''

  if (explicitHost) {
    return {
      host: explicitHost,
      port:
        process.env.SAAS_DATA_PLANE_PG_PORT?.trim() ||
        process.env.PROVISIONER_PG_REMOTE_PORT?.trim() ||
        process.env.PROVISIONER_PG_PORT?.trim() ||
        process.env.PLATFORM_PG_REMOTE_PORT?.trim() ||
        '5433',
    }
  }

  if (isRemoteDataPlaneProvisioner()) {
    return {
      host: '103.190.92.249',
      port: process.env.PLATFORM_PG_REMOTE_PORT?.trim() || '5433',
    }
  }

  return null
}

export function resolveTenantDockerNetworkName(): string {
  const fromEnv =
    process.env.SAAS_DOCKER_NETWORK_NAME?.trim() ||
    process.env.PROVISIONER_TENANT_DOCKER_NETWORK?.trim() ||
    ''

  if (fromEnv) return fromEnv

  return isRemoteDataPlaneProvisioner()
    ? 'indobase-backend-bmqhan_default'
    : 'indobase_default'
}

const LOCAL_PG_HOSTS = new Set(['indobase-db', 'db', 'localhost', '127.0.0.1'])

export function rewriteDbUriForRemoteDataPlane(uri: string): string {
  const remote = resolveRemoteDataPlanePgEndpoint()
  if (!remote) return uri

  let out = uri
  for (const localHost of LOCAL_PG_HOSTS) {
    out = out.replace(new RegExp(`@${localHost}:5432`, 'g'), `@${remote.host}:${remote.port}`)
    out = out.replace(new RegExp(`@${localHost}:5433`, 'g'), `@${remote.host}:${remote.port}`)
  }

  return out
}

export function rewriteRealtimeDbHostForRemoteDataPlane(hostname: string): string {
  const remote = resolveRemoteDataPlanePgEndpoint()
  if (!remote) return hostname
  if (!LOCAL_PG_HOSTS.has(hostname)) return hostname
  return remote.host
}

export function rewriteRealtimeDbPortForRemoteDataPlane(hostname: string, port: string): string {
  const remote = resolveRemoteDataPlanePgEndpoint()
  if (!remote) return port

  if (LOCAL_PG_HOSTS.has(hostname)) return remote.port

  // Stacks already on the remote host must use the Postgres bridge (5433), not pooler (5432).
  if (hostname === remote.host && (port === '5432' || !port.trim())) return remote.port

  return port
}
