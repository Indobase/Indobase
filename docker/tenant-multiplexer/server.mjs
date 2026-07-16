/**
 * Indobase tenant multiplexer — shared gateway for Free-tier projects.
 *
 * Routes api.indobase.in (via Kong x-project-ref) and ref.<domain> hostnames
 * to per-project slim sidecars (PostgREST, GoTrue, Storage, Realtime, Functions)
 * without per-tenant Traefik YAML files.
 *
 * Route registry: SHARED_GATEWAY_ROUTES_FILE (JSON map ref → ports).
 */
import http from 'node:http'
import fs from 'node:fs'
import httpProxy from 'http-proxy'

const PORT = Number(process.env.PORT || '8090')
const ROUTES_FILE =
  process.env.SHARED_GATEWAY_ROUTES_FILE || '/data/shared-gateway-routes.json'
const UPSTREAM_HOST = (process.env.TRAEFIK_UPSTREAM_HOST || '172.17.0.1').trim()
const RELOAD_POLL_MS = Number(process.env.SHARED_GATEWAY_ROUTES_POLL_MS || '5000')

/** @type {Record<string, { rest: number, auth: number, storage: number, realtime: number, functions: number, site?: number }>} */
let routeMap = {}
let lastMtime = 0

function loadRoutes() {
  try {
    const stat = fs.statSync(ROUTES_FILE)
    if (stat.mtimeMs <= lastMtime && Object.keys(routeMap).length > 0) return
    lastMtime = stat.mtimeMs
    const raw = fs.readFileSync(ROUTES_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    routeMap = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    if (Object.keys(routeMap).length === 0) routeMap = {}
  }
}

function resolveRef(req) {
  const headerRef = req.headers['x-project-ref']
  if (typeof headerRef === 'string' && headerRef.trim()) return headerRef.trim().toLowerCase()

  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString()
  const hostname = host.split(',')[0].split(':')[0].trim().toLowerCase()
  const match = hostname.match(/^([a-z0-9-]+)\./)
  if (!match) return null
  const label = match[1]
  const reserved = new Set([
    'api',
    'studio',
    'builder',
    'dashboard',
    'auth',
    'realtime',
    'storage',
    'functions',
    'meta',
    'kong',
    'www',
  ])
  if (reserved.has(label)) return null
  return label
}

function upstreamForPath(ref, path) {
  const routes = routeMap[ref]
  if (!routes) return null

  if (path.startsWith('/auth/v1')) {
    return { target: `http://${UPSTREAM_HOST}:${routes.auth}`, stripPrefix: '/auth/v1' }
  }
  if (path.startsWith('/rest/v1')) {
    return { target: `http://${UPSTREAM_HOST}:${routes.rest}`, stripPrefix: '/rest/v1' }
  }
  if (path.startsWith('/storage/v1')) {
    return { target: `http://${UPSTREAM_HOST}:${routes.storage}`, stripPrefix: '/storage/v1' }
  }
  if (path.startsWith('/realtime/v1')) {
    return { target: `http://${UPSTREAM_HOST}:${routes.realtime}`, stripPrefix: '/realtime/v1' }
  }
  if (path.startsWith('/functions/v1')) {
    return { target: `http://${UPSTREAM_HOST}:${routes.functions}`, stripPrefix: '/functions/v1' }
  }
  if (routes.site && (path === '/' || path.startsWith('/site'))) {
    return { target: `http://${UPSTREAM_HOST}:${routes.site}` }
  }
  return { target: `http://${UPSTREAM_HOST}:${routes.rest}`, stripPrefix: '/rest/v1' }
}

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
})

proxy.on('error', (err, _req, res) => {
  const message = err instanceof Error ? err.message : 'proxy error'
  if (res && 'writeHead' in res && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ message: `Tenant gateway error: ${message}` }))
  }
})

const server = http.createServer((req, res) => {
  loadRoutes()

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', tenants: Object.keys(routeMap).length }))
    return
  }

  if (url.pathname === '/reload' && req.method === 'POST') {
    lastMtime = 0
    loadRoutes()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, tenants: Object.keys(routeMap).length }))
    return
  }

  const ref = resolveRef(req)
  if (!ref) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Missing tenant context (project ref)' }))
    return
  }

  const upstream = upstreamForPath(ref, url.pathname)
  if (!upstream) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `Unknown or inactive project: ${ref}` }))
    return
  }

  const proxyReq = req
  if (upstream.stripPrefix && url.pathname.startsWith(upstream.stripPrefix)) {
    const remainder = url.pathname.slice(upstream.stripPrefix.length) || '/'
    proxyReq.url = `${remainder}${url.search}`
  }

  proxy.web(proxyReq, res, { target: upstream.target })
})

server.on('upgrade', (req, socket, head) => {
  loadRoutes()
  const ref = resolveRef(req)
  if (!ref) {
    socket.destroy()
    return
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const upstream = upstreamForPath(ref, url.pathname)
  if (!upstream) {
    socket.destroy()
    return
  }
  proxy.ws(req, socket, head, { target: upstream.target.replace(/^http/, 'ws') })
})

setInterval(loadRoutes, RELOAD_POLL_MS)
loadRoutes()

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[tenant-multiplexer] listening on :${PORT}, routes=${ROUTES_FILE}`)
})
