/**
 * Canonical per-tenant Traefik dynamic config (stripPrefix + correct host ports).
 * Used by the data-plane provisioner after compose up and by VPS repair scripts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { readSiteRoutes } from './site-routes.mjs'

/** In-memory docker-ps snapshot so HTTP handlers never block on sync docker CLI. */
let dockerPsSnapshot = ''
let dockerPsUpdatedAt = 0
let dockerPsPollerStarted = false
let dockerPsRefreshInflight = null

const DOCKER_PS_CACHE_MS = 2000
const DOCKER_PS_SYNC_TIMEOUT_MS = 60_000

function applyDockerPsSnapshot(lines) {
  dockerPsSnapshot = String(lines || '')
  dockerPsUpdatedAt = Date.now()
  return dockerPsSnapshot
}

/**
 * Async refresh used by the background poller and post-compose repair paths.
 * Concurrent callers share one in-flight `docker ps`.
 */
export function refreshDockerPsLines() {
  if (dockerPsRefreshInflight) return dockerPsRefreshInflight
  dockerPsRefreshInflight = new Promise((resolve) => {
    let out = ''
    const p = spawn('docker', ['ps', '--format', '{{.Names}}\t{{.Ports}}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const timer = setTimeout(() => {
      try {
        p.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, DOCKER_PS_SYNC_TIMEOUT_MS)
    p.stdout.on('data', (chunk) => {
      out += chunk
    })
    p.on('error', () => {
      clearTimeout(timer)
      dockerPsRefreshInflight = null
      // Keep the last good snapshot — never replace with empty/partial on failure.
      resolve(dockerPsSnapshot)
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      dockerPsRefreshInflight = null
      if (code === 0 && out.trim()) {
        resolve(applyDockerPsSnapshot(out))
        return
      }
      resolve(dockerPsSnapshot)
    })
  })
  return dockerPsRefreshInflight
}

/** Start a background poller so request paths can read a warm snapshot without execSync. */
export function startDockerPsPoller(intervalMs = DOCKER_PS_CACHE_MS) {
  if (dockerPsPollerStarted) return
  dockerPsPollerStarted = true
  void refreshDockerPsLines()
  setInterval(() => {
    void refreshDockerPsLines()
  }, Math.max(1000, Number(intervalMs) || DOCKER_PS_CACHE_MS)).unref?.()
}

/**
 * Return docker ps lines. Prefer the warm async snapshot; only fall back to a timed
 * execSync when `fresh: true` (repair after compose) or the snapshot is empty.
 */
export function getDockerPsLines(opts = {}) {
  const fresh = Boolean(opts?.fresh)
  const age = Date.now() - dockerPsUpdatedAt
  if (!fresh && dockerPsSnapshot && age <= DOCKER_PS_CACHE_MS) {
    return dockerPsSnapshot
  }
  if (!fresh && dockerPsSnapshot) {
    // Stale-but-present snapshot: never block the event loop on the request path.
    if (!dockerPsRefreshInflight) void refreshDockerPsLines()
    return dockerPsSnapshot
  }
  try {
    const lines = execSync('docker ps --format "{{.Names}}\t{{.Ports}}"', {
      encoding: 'utf8',
      timeout: DOCKER_PS_SYNC_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    })
    return applyDockerPsSnapshot(lines)
  } catch {
    return dockerPsSnapshot
  }
}

export function hostPortFor(dockerPs, ref, svc) {
  const needles =
    svc === 'realtime'
      ? [`${ref}.indobase-realtime`, `${ref}-tenant-realtime`, `indobase-tenant-${ref}-tenant-realtime`]
      : svc === 'site'
        ? [`${ref}-tenant-site`, `indobase-tenant-${ref}-tenant-site`]
        : [`${ref}-tenant-${svc}`, `indobase-tenant-${ref}-tenant-${svc}`]
  const line = dockerPs.split('\n').find((l) => needles.some((n) => l.includes(n)))
  if (!line) return null
  // Match any published host IP (0.0.0.0, 127.0.0.1, 172.17.0.1, or VPS public IP).
  // Docker may bind only to the machine's primary address, which previously looked like
  // "stack_not_running" even when containers were healthy.
  const m = line.match(/(?:\d{1,3}(?:\.\d{1,3}){3}|\[::\]):(\d+)->/)
  return m ? Number(m[1]) : null
}

const CONTAINER_PORT_BY_SVC = {
  rest: 3000,
  auth: 9999,
  storage: 5000,
  realtime: 4000,
  functions: 9000,
  site: 8080,
}

/** When `docker ps` omits the Ports column (common under load), fall back to inspect. */
export function hostPortFromInspect(ref, svc) {
  const containerPort = CONTAINER_PORT_BY_SVC[svc]
  if (!containerPort) return null
  const names =
    svc === 'realtime'
      ? [`${ref}.indobase-realtime`, `indobase-tenant-${ref}-tenant-realtime-1`]
      : [`indobase-tenant-${ref}-tenant-${svc}-1`, `${ref}-tenant-${svc}-1`]
  for (const name of names) {
    try {
      const raw = execSync(`docker inspect ${name}`, {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const data = JSON.parse(raw)[0]
      const key = `${containerPort}/tcp`
      const live = data?.NetworkSettings?.Ports?.[key]
      if (Array.isArray(live) && live[0]?.HostPort) return Number(live[0].HostPort)
      const bound = data?.HostConfig?.PortBindings?.[key]
      if (Array.isArray(bound) && bound[0]?.HostPort) return Number(bound[0].HostPort)
    } catch {
      /* try next name */
    }
  }
  return null
}

export function resolveHostPort(dockerPs, ref, svc) {
  return hostPortFor(dockerPs, ref, svc) ?? hostPortFromInspect(ref, svc)
}

export function buildTenantTraefikYaml(ref, hostRule, upstream, ports, opts = {}) {
  const siteProxyPort =
    opts.siteProxyPort != null && Number.isFinite(Number(opts.siteProxyPort))
      ? Number(opts.siteProxyPort)
      : null
  const sitePort = siteProxyPort != null ? siteProxyPort : ports.site

  const strip = (name, prefix) => `    tenant-${ref}-${name}-strip:
      stripPrefix:
        prefixes:
          - "${prefix}"
`
  /*
   * Browser CORS for the data APIs. Generated apps (and the Builder preview)
   * call these endpoints cross-origin via supabase-js, which sends an `apikey`
   * (and `x-client-info`) header — so every request is preflighted. GoTrue is
   * exposed directly (no Kong gateway) and its built-in CORS allow-list does
   * NOT include `apikey`, so it rejects the preflight with 204 and no
   * Access-Control-* headers -> the browser reports "Failed to fetch". Handle
   * the preflight at Traefik for all API routers. Traefik answers OPTIONS
   * itself and Set()s (overwrites, not appends) Access-Control-Allow-Origin on
   * real responses, so there is no duplicate header with GoTrue/PostgREST.
   */
  const corsMiddleware = `    tenant-${ref}-cors:
      headers:
        accessControlAllowOriginList:
          - "*"
        accessControlAllowMethods: [GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD]
        accessControlAllowHeaders: [authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept, accept-profile, content-profile, prefer, x-upsert, range, x-region, x-requested-with]
        accessControlMaxAge: 86400
        addVaryHeader: true
`
  const apiRouter = (name, prefix) => `    tenant-${ref}-${name}:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`${prefix}\`)
      priority: 300
      middlewares:
        - redirect-to-https
      service: tenant-${ref}-${name}
      entryPoints:
        - web
    tenant-${ref}-${name}-https:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`${prefix}\`)
      priority: 300
      middlewares:
        - indobase-wake
        - tenant-${ref}-cors
        - tenant-${ref}-${name}-strip
      service: tenant-${ref}-${name}
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
`

  const siteRouter =
    sitePort != null
      ? `    tenant-${ref}-site:
      rule: Host(\`${hostRule}\`)
      priority: 250
      middlewares:
        - redirect-to-https
      service: tenant-${ref}-site
      entryPoints:
        - web
    tenant-${ref}-site-https:
      rule: Host(\`${hostRule}\`)
      priority: 250
      middlewares:
        - indobase-wake
      service: tenant-${ref}-site
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
`
      : ''

  const siteService =
    sitePort != null
      ? `    tenant-${ref}-site:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${sitePort}" }]
        passHostHeader: true
`
      : ''

  return `# Generated by Studio — per-project routing (REST, Auth, Storage, Realtime, Functions, Site)
http:
  middlewares:
${corsMiddleware}${strip('rest', '/rest/v1')}${strip('auth', '/auth/v1')}${strip('storage', '/storage/v1')}${strip('s3', '/s3')}${strip('realtime', '/realtime/v1')}${strip('functions', '/functions/v1')}
  routers:
${apiRouter('rest', '/rest/v1')}${apiRouter('auth', '/auth/v1')}${apiRouter('storage', '/storage/v1')}${apiRouter('s3', '/s3')}${apiRouter('realtime', '/realtime/v1')}${apiRouter('functions', '/functions/v1')}${siteRouter}
  services:
    tenant-${ref}-rest:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.rest}" }]
        passHostHeader: true
    tenant-${ref}-auth:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.auth}" }]
        passHostHeader: true
    tenant-${ref}-storage:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.storage}" }]
        passHostHeader: true
    tenant-${ref}-s3:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.storage}" }]
        passHostHeader: true
    tenant-${ref}-realtime:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.realtime}" }]
        passHostHeader: true
    tenant-${ref}-functions:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${ports.functions}" }]
        passHostHeader: true
${siteService}`
}

/**
 * Rewrite tenant-<ref>.yml from live docker published ports. Returns false if stack not running.
 */
export function fixTenantTraefikForRef(ref, traefikDir, opts = {}) {
  const upstream = opts.upstream || process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
  const domain = opts.domain || process.env.PUBLIC_DOMAIN?.trim() || 'indobase.in'
  const dockerPs = opts.dockerPs || getDockerPsLines()
  const ports = {
    rest: resolveHostPort(dockerPs, ref, 'rest'),
    auth: resolveHostPort(dockerPs, ref, 'auth'),
    storage: resolveHostPort(dockerPs, ref, 'storage'),
    realtime: resolveHostPort(dockerPs, ref, 'realtime'),
    functions: resolveHostPort(dockerPs, ref, 'functions'),
    site: resolveHostPort(dockerPs, ref, 'site'),
  }
  const requiredPorts = ['rest', 'auth', 'storage', 'realtime', 'functions']
  if (requiredPorts.some((key) => ports[key] == null)) {
    return { ok: false, ref, ports, reason: 'stack_not_running' }
  }

  const siteRoutes = readSiteRoutes(traefikDir)
  const hasSiteRoute = Boolean(siteRoutes[ref])
  const siteProxyEnabled = process.env.SITE_STATIC_PROXY_ENABLED === 'true'
  let siteProxyPort =
    opts.siteProxyPort != null && Number.isFinite(Number(opts.siteProxyPort))
      ? Number(opts.siteProxyPort)
      : null
  // Never silently redirect site traffic to :8790 unless the proxy process is enabled.
  if (hasSiteRoute && siteProxyPort == null && siteProxyEnabled) {
    siteProxyPort = Number(process.env.SITE_STATIC_PROXY_PORT || 8790)
  }
  if (!siteProxyEnabled) {
    siteProxyPort = null
  }

  const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)
  fs.writeFileSync(
    traefikPath,
    buildTenantTraefikYaml(ref, `${ref}.${domain}`, upstream, ports, {
      siteProxyPort,
    }),
    'utf8'
  )
  return { ok: true, ref, ports, traefikPath, site_proxy_port: siteProxyPort }
}

export function fixAllTenantTraefikFromDocker(traefikDir, opts = {}) {
  const dockerPs = getDockerPsLines()
  const refs = new Set()
  for (const line of dockerPs.split('\n')) {
    const m = line.match(/indobase-tenant-([a-z0-9-]+)-tenant-rest/)
    if (m) refs.add(m[1])
  }
  const results = []
  for (const ref of refs) {
    results.push(fixTenantTraefikForRef(ref, traefikDir, { ...opts, dockerPs }))
  }
  return results
}
