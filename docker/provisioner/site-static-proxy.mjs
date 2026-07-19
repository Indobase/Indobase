import http from 'node:http'
import { readSiteRoutes } from './site-routes.mjs'
import { getDockerPsLines, hostPortFor } from './tenant-traefik.mjs'

const HOSTING_BUCKET = 'hosting'
const DEFAULT_PROXY_PORT = 8790

/**
 * Extract project ref from Host header (e.g. myproj.indobase.in -> myproj).
 */
export function parseRefFromHost(host, domain) {
  const normalizedHost = String(host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
  const normalizedDomain = String(domain || process.env.PUBLIC_DOMAIN || 'indobase.in')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')

  if (!normalizedHost || !normalizedDomain) return null

  const suffix = `.${normalizedDomain}`
  if (!normalizedHost.endsWith(suffix)) return null

  const ref = normalizedHost.slice(0, -suffix.length)
  if (!ref || !/^[a-z0-9-]+$/i.test(ref)) return null
  return ref
}

/**
 * SPA fallback candidates: exact path, directory index, root index.html.
 */
export function buildSpaFallbackPaths(requestPath) {
  const raw = String(requestPath || '/').split('?')[0]
  const pathName = raw.startsWith('/') ? raw : `/${raw}`
  const trimmed = pathName.replace(/\/+$/, '') || '/'

  const candidates = new Set()
  candidates.add(trimmed)

  if (trimmed !== '/') {
    if (!trimmed.includes('.')) {
      candidates.add(`${trimmed}/index.html`)
      candidates.add(`${trimmed}.html`)
    }
  }

  candidates.add('/index.html')
  return [...candidates]
}

export function resolveStorageObjectUrl({ upstream, storagePort, prefix, objectPath }) {
  const host = String(upstream || process.env.TRAEFIK_UPSTREAM_HOST || '172.17.0.1').trim()
  const port = Number(storagePort)
  const normalizedPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '')
  const normalizedObject = String(objectPath || '').replace(/^\/+/, '')
  const storagePath = normalizedPrefix
    ? `${normalizedPrefix}/${normalizedObject}`
    : normalizedObject

  // Direct tenant-storage publish port has no Kong/Traefik stripPrefix — the API root is `/object/...`.
  return `http://${host}:${port}/object/public/${HOSTING_BUCKET}/${storagePath}`
}

export function getStoragePortForRef(ref, dockerPs, routes, traefikDir) {
  const route = routes?.[ref] || readSiteRoutes(traefikDir)[ref]
  if (route?.storage_port != null) {
    const port = Number(route.storage_port)
    if (Number.isFinite(port) && port > 0) return port
  }

  return hostPortFor(dockerPs, ref, 'storage')
}

async function fetchStorageObject(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    if (!res.ok) return null
    return res
  } catch {
    return null
  }
}

async function proxyRequest(req, res, { traefikDir, upstream, domain, dockerPs }) {
  const host = req.headers.host || ''
  const ref = parseRefFromHost(host, domain)
  if (!ref) {
    res.statusCode = 404
    res.end('unknown host')
    return
  }

  const routes = readSiteRoutes(traefikDir)
  const route = routes[ref]
  if (!route) {
    res.statusCode = 404
    res.end('site route not registered')
    return
  }

  const storagePort = getStoragePortForRef(ref, dockerPs, routes, traefikDir)
  if (storagePort == null) {
    res.statusCode = 503
    res.end('storage upstream unavailable')
    return
  }

  const requestPath = (req.url || '/').split('?')[0] || '/'
  const prefix = route.prefix || `sites/${route.deployment_id}`
  const candidates = buildSpaFallbackPaths(requestPath)

  for (const candidate of candidates) {
    const objectPath = candidate === '/' ? 'index.html' : candidate.replace(/^\//, '')
    const url = resolveStorageObjectUrl({
      upstream,
      storagePort,
      prefix,
      objectPath,
    })
    const storageRes = await fetchStorageObject(url)
    if (!storageRes) continue

    res.statusCode = storageRes.status
    const contentType = storageRes.headers.get('content-type')
    if (contentType) res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'public, max-age=60')
    const body = Buffer.from(await storageRes.arrayBuffer())
    res.end(body)
    return
  }

  res.statusCode = 404
  res.end('not found')
}

/**
 * Start HTTP proxy that serves tenant static sites from public storage URLs.
 */
export function startSiteStaticProxy({ traefikDir, port, upstream, domain, dockerPs } = {}) {
  const listenPort = Number(port ?? process.env.SITE_STATIC_PROXY_PORT ?? DEFAULT_PROXY_PORT)
  const resolvedUpstream = upstream || process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
  const resolvedDomain = domain || process.env.PUBLIC_DOMAIN?.trim() || 'indobase.in'
  const resolvedTraefikDir = traefikDir || process.env.PROVISIONER_TRAEFIK_DYNAMIC_DIR || '/mnt/traefik'
  let psLines = dockerPs

  const server = http.createServer((req, res) => {
    if (!psLines) {
      try {
        psLines = getDockerPsLines()
      } catch {
        psLines = ''
      }
    }

    proxyRequest(req, res, {
      traefikDir: resolvedTraefikDir,
      upstream: resolvedUpstream,
      domain: resolvedDomain,
      dockerPs: psLines,
    }).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500
        res.end(err?.message || 'proxy error')
      }
    })
  })

  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`site-static-proxy listening on :${listenPort}`)
  })

  return server
}
