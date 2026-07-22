import http from 'node:http'
import { readSiteRoutes } from './site-routes.mjs'
import { getDockerPsLines, hostPortFor } from './tenant-traefik.mjs'

const HOSTING_BUCKET = 'hosting'
const DEFAULT_PROXY_PORT = 8790

/*
 * Traefik's `errors` middleware forwards 502/503/504 (a stopped tenant's API or isolated-stack site)
 * to this path on the provisioner, preserving the original tenant host in X-Forwarded-Host. We use
 * it to wake the stack and return the "starting up" page — the API/isolated-stack half of
 * wake-on-traffic, complementing the shared-gateway site path handled inline below.
 */
const WAKE_GATE_PATH = '/__indobase_wake'

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

/**
 * Returns the Response on success, 'not-found' on an HTTP error (object genuinely missing), or
 * 'unreachable' when the storage container cannot be connected to (stack is stopped). The caller
 * uses 'unreachable' to distinguish a sleeping tenant (wake it) from a real 404 (serve 404).
 */
async function fetchStorageObject(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    if (!res.ok) return res.status >= 500 ? 'unreachable' : 'not-found'
    return res
  } catch {
    return 'unreachable'
  }
}

/** Calm auto-retrying page shown while a slept tenant stack resumes (≈10–20s). */
function wakingPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Starting up…</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    background:#0b0b0d; color:#ededf0; }
  .card { text-align:center; padding:2rem; max-width:22rem; }
  .ring { width:44px; height:44px; margin:0 auto 1.25rem; border-radius:50%;
    border:3px solid rgba(255,153,51,.25); border-top-color:#ff9933; animation:spin 1s linear infinite; }
  h1 { font-size:1.1rem; font-weight:600; margin:0 0 .5rem; }
  p { font-size:.875rem; line-height:1.5; color:#a1a1aa; margin:0; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style></head><body>
  <div class="card">
    <div class="ring"></div>
    <h1>Waking this app up…</h1>
    <p>It was asleep after a quiet spell. It’ll be ready in a few seconds — this page refreshes automatically.</p>
  </div>
</body></html>`
}

function serveWaking(res, ref, wakeTenant) {
  // Fire-and-forget resume; the debounce inside wakeTenant collapses a burst of hits into one start.
  if (typeof wakeTenant === 'function') {
    try {
      void wakeTenant(ref)
    } catch {
      /* never let a wake failure break the response */
    }
  }
  res.statusCode = 503
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('retry-after', '5')
  res.setHeader('cache-control', 'no-store')
  res.end(wakingPage())
}

async function proxyRequest(req, res, { traefikDir, upstream, domain, dockerPs, wakeTenant }) {
  const reqPath = (req.url || '/').split('?')[0]

  // Traefik errors-middleware wake gate: original tenant host is in X-Forwarded-Host.
  if (reqPath === WAKE_GATE_PATH) {
    const originalHost = req.headers['x-forwarded-host'] || req.headers.host || ''
    const wakeRef = parseRefFromHost(String(originalHost).split(',')[0], domain)
    serveWaking(res, wakeRef || '', wakeTenant)
    return
  }

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
    // Route is registered but no storage container is running → the stack is asleep. Wake it and
    // show the visitor a "starting up" page that auto-retries, instead of a dead 503.
    serveWaking(res, ref, wakeTenant)
    return
  }

  const requestPath = (req.url || '/').split('?')[0] || '/'
  const prefix = route.prefix || `sites/${route.deployment_id}`
  const candidates = buildSpaFallbackPaths(requestPath)

  let stackUnreachable = false

  for (const candidate of candidates) {
    const objectPath = candidate === '/' ? 'index.html' : candidate.replace(/^\//, '')
    const url = resolveStorageObjectUrl({
      upstream,
      storagePort,
      prefix,
      objectPath,
    })
    const storageRes = await fetchStorageObject(url)

    // A stored storage_port can outlive the container: the port is known but nothing answers.
    // Treat that as a sleeping stack, not a missing file.
    if (storageRes === 'unreachable') {
      stackUnreachable = true
      continue
    }
    if (storageRes === 'not-found') continue

    res.statusCode = storageRes.status
    const contentType = storageRes.headers.get('content-type')
    if (contentType) res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'public, max-age=60')
    const body = Buffer.from(await storageRes.arrayBuffer())
    res.end(body)
    return
  }

  if (stackUnreachable) {
    serveWaking(res, ref, wakeTenant)
    return
  }

  res.statusCode = 404
  res.end('not found')
}

/**
 * Start HTTP proxy that serves tenant static sites from public storage URLs.
 */
export function startSiteStaticProxy({ traefikDir, port, upstream, domain, dockerPs, wakeTenant } = {}) {
  const listenPort = Number(port ?? process.env.SITE_STATIC_PROXY_PORT ?? DEFAULT_PROXY_PORT)
  const resolvedUpstream = upstream || process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
  const resolvedDomain = domain || process.env.PUBLIC_DOMAIN?.trim() || 'indobase.in'
  const resolvedTraefikDir = traefikDir || process.env.PROVISIONER_TRAEFIK_DYNAMIC_DIR || '/mnt/traefik'
  let psLines = dockerPs || ''
  let psFetchedAt = dockerPs ? Date.now() : 0

  const server = http.createServer((req, res) => {
    // Refresh docker ps on a short TTL. A permanently-cached snapshot (the previous behaviour)
    // would keep reporting a stopped stack's old port, so a woken tenant would never serve and a
    // slept one would never be detected — but re-reading on every request is wasteful under load.
    if (Date.now() - psFetchedAt > 2000) {
      try {
        psLines = getDockerPsLines()
        psFetchedAt = Date.now()
      } catch {
        /* keep the last good snapshot */
      }
    }

    proxyRequest(req, res, {
      traefikDir: resolvedTraefikDir,
      upstream: resolvedUpstream,
      domain: resolvedDomain,
      dockerPs: psLines,
      wakeTenant,
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
