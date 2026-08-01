/**
 * Indobase Discuss — Studio SSO bridge + Gameplan reverse proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. Bridge exchanges the JWT via
 * Frappe `indobase_discuss.api.studio_handoff.exchange`, sets session cookies,
 * and proxies `/g/*` (+ assets / Frappe API) to the Gameplan upstream.
 * Customer UI is branded Indobase Discuss only.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'

import {
  AUDIENCE,
  clearSessionCookie,
  createSessionToken,
  hasFrappeSessionCookies,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  sessionCookie,
  verifyStudioHandoff,
  type Session,
} from './auth.js'
import { brandDiscussHtml, shouldBrandDiscussResponse } from './brand-html.js'
import {
  buildUpstreamProxyHeaders,
  sanitizeProxiedResponseHeaders,
} from './proxy-headers.js'
import { buildDiscussSpaceMap, gameplanSpacePath, rewriteLegacyGameplanPath } from './space-map.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'
import { renderDiscussWelcomeHtml } from './welcome.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const GAMEPLAN_UPSTREAM = (process.env.GAMEPLAN_UPSTREAM || '').replace(/\/+$/, '')
const FRAPPE_HANDOFF_URL = (process.env.FRAPPE_STUDIO_HANDOFF_URL || '').replace(/\/+$/, '')
/** Frappe multi-site name — must match DISCUSS_SITE_NAME on the gameplan container. */
const DISCUSS_SITE_NAME = (process.env.DISCUSS_SITE_NAME || 'discuss.localhost').trim() || 'discuss.localhost'

/** Realtime listens on :9000; HTTP bench is :8000. */
function deriveSocketUpstream(httpUpstream: string): string {
  const explicit = (process.env.SOCKET_UPSTREAM || '').replace(/\/+$/, '')
  if (explicit) return explicit
  if (!httpUpstream) return ''
  try {
    const u = new URL(httpUpstream)
    u.port = (process.env.SOCKET_PORT || '9000').trim() || '9000'
    return u.origin
  } catch {
    return httpUpstream
  }
}
const SOCKET_UPSTREAM = deriveSocketUpstream(GAMEPLAN_UPSTREAM)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_ROOT = path.resolve(__dirname, '../public')

function isBridgeOwnedPath(pathname: string): boolean {
  return (
    pathname === '/healthz' ||
    pathname === '/api/me' ||
    pathname.startsWith('/sso/') ||
    pathname === '/sso' ||
    pathname.startsWith('/brand/') ||
    pathname === '/notices'
  )
}

function isNativeAuthPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/logout' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/api/method/login') ||
    pathname.startsWith('/api/method/logout')
  )
}

/** Frappe login sets multiple cookies (sid, system_user, …) — forward all of them. */
function forwardUpstreamCookies(upstream: Response, c: Context) {
  const headers = upstream.headers as Headers & { getSetCookie?: () => string[] }
  const cookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : upstream.headers.get('set-cookie')
        ? [upstream.headers.get('set-cookie') as string]
        : []
  for (const cookie of cookies) {
    c.res.headers.append('Set-Cookie', cookie)
  }
}

function frappeHandoffRedirect(body: {
  redirect?: string
  message?: { redirect?: string }
}): string | undefined {
  return body.redirect ?? body.message?.redirect
}

function sessionFromRequest(c: Context): Session | null {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return null
  }
  const raw = readCookie(c.req.header('cookie'))
  return raw ? readSessionToken(raw, secret) : null
}

async function pingUpstream(): Promise<boolean> {
  if (!GAMEPLAN_UPSTREAM) return false
  try {
    const res = await fetch(`${GAMEPLAN_UPSTREAM}/api/method/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

// Brand assets
app.use(
  '/brand/*',
  serveStatic({
    root: PUBLIC_ROOT,
  })
)

// AGPL notices (network users must reach without signing in)
app.get('/notices', (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Open source notices — Indobase Discuss</title>
<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" /></head>
<body style="font-family:system-ui;max-width:40rem;margin:40px auto;padding:0 16px;color:#0f172a;line-height:1.5">
<h1>Open source notices</h1>
<p>Indobase Discuss includes <a href="https://github.com/frappe/gameplan">Gameplan</a> (AGPL-3.0) by Frappe Technologies.
See <code>NOTICE.md</code> and upstream <code>LICENSE</code> in the Indobase repository under <code>indobase-discuss/</code>.</p>
<p><a href="/">Back</a></p>
</body></html>`)
)

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening Indobase Discuss…</title>
<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
</head>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#0f172a;background:#f8fafc">
<div style="text-align:center">
  <img src="/brand/indobase-logo-mark-80.png" alt="" width="48" height="48" style="display:block;margin:0 auto 16px" />
  <p style="margin:0;font-weight:600;font-size:15px">Opening Indobase Discuss…</p>
</div>
<script>
(async () => {
  var h = new URLSearchParams(location.hash.slice(1));
  var t = h.get('token');
  if (!t) { location.replace(${JSON.stringify(STUDIO_URL)} + '/sign-in'); return; }
  history.replaceState(null, '', '/sso/launch' + location.search);
  var r = await fetch('/sso/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t })
  });
  if (!r.ok) {
    var reason = '';
    try { reason = ((await r.json()) || {}).error || ''; } catch (_) {}
    document.body.innerHTML =
      '<div style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;padding:24px;text-align:center;color:#1e293b">' +
      '<div style="max-width:34rem"><p style="font-weight:600;margin:0 0 8px">Could not open this workspace</p>' +
      '<p style="margin:0 0 8px;color:#475569;font-size:14px">' + (reason || ('The handoff was rejected (HTTP ' + r.status + ').')) + '</p>' +
      (r.status === 401
        ? '<p style="margin:0 0 16px;color:#64748b;font-size:13px">This usually means the handoff secret does not match between Studio and this service.</p>'
        : '') +
      '<a href="' + ${JSON.stringify(STUDIO_URL)} + '" style="font-size:14px;color:#3B8FD6">Back to Indobase Studio</a></div></div>';
    return;
  }
  var dest = '/';
  try {
    var body = await r.json();
    if (body && body.redirect) dest = body.redirect;
  } catch (_) {}
  location.replace(dest);
})();
</script></body></html>`)
)

app.post('/sso/session', async (c) => {
  let token = ''
  try {
    token = ((await c.req.json()) as { token?: string }).token ?? ''
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }
  if (!token) return c.json({ error: 'missing token' }, 400)

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    console.error('[discuss] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildDiscussSpaceMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })
  const fallbackRedirect = gameplanSpacePath(map)

  if (FRAPPE_HANDOFF_URL) {
    try {
      const upstream = await fetch(FRAPPE_HANDOFF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '')
        console.error('[discuss] frappe handoff HTTP', upstream.status, detail.slice(0, 400))
        return c.json(
          {
            error:
              upstream.status === 401
                ? 'handoff rejected by Discuss backend (secret mismatch or expired token)'
                : 'Discuss backend is not ready yet — try again in a minute',
          },
          upstream.status === 401 ? 401 : 503
        )
      }
      forwardUpstreamCookies(upstream, c)
      const body = (await upstream.json().catch(() => ({}))) as {
        redirect?: string
        message?: { redirect?: string }
      }
      c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
      return c.json({ ok: true, redirect: frappeHandoffRedirect(body) || fallbackRedirect })
    } catch (err) {
      console.error('[discuss] frappe handoff failed:', err)
      return c.json({ error: 'Discuss backend is unreachable' }, 503)
    }
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect: fallbackRedirect })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', async (c) => {
  const body = publicSsoHealth({
    service: 'indobase-discuss',
    audience: AUDIENCE,
    versionEnvKeys: ['DISCUSS_VERSION', 'GIT_SHA'],
  })
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  ;(body as { upstreamReady?: boolean }).upstreamReady = await pingUpstream()
  return c.json(body)
})

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireSession(c: Context<{ Variables: Vars }>, next: Next) {
  const session = sessionFromRequest(c)
  if (!session) return c.json({ error: 'unauthorized', signInUrl: `${STUDIO_URL}/sign-in` }, 401)
  c.set('session', session)
  await next()
}

app.get('/api/me', requireSession, (c) => {
  const s = c.get('session')
  const map = buildDiscussSpaceMap({
    orgSlug: s.orgSlug,
    projectRef: s.projectRef,
    projectName: s.projectName,
    organizationName: s.organizationName,
  })
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    canPost: s.canPost,
    studioUrl: s.studioUrl,
    space: map,
    spacePath: gameplanSpacePath(map),
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-discuss' }))

// ── Gameplan proxy ───────────────────────────────────────────────────────────

async function proxyToUpstream(c: Context, upstreamBase: string) {
  if (!upstreamBase) return c.notFound()
  const url = new URL(c.req.url)
  const target = `${upstreamBase}${url.pathname}${url.search}`
  const headers = buildUpstreamProxyHeaders(c.req.raw.headers, { siteHost: DISCUSS_SITE_NAME })

  let res: Response
  try {
    res = await fetch(target, {
      method: c.req.method,
      headers,
      body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
      redirect: 'manual',
      // Avoid undici streaming crashes (`assert(!this.paused)`) that became Traefik 502s.
      // Buffering keeps Content-Length honest for JS/CSS/manifest assets.
    })
  } catch (err) {
    console.error('[discuss] upstream proxy error:', url.pathname, err)
    return c.text('Discuss upstream unavailable', 502)
  }

  const outHeaders = sanitizeProxiedResponseHeaders(res.headers)
  const contentType = res.headers.get('content-type')

  if (c.req.method === 'HEAD') {
    return new Response(null, { status: res.status, headers: outHeaders })
  }

  if (shouldBrandDiscussResponse(contentType)) {
    const html = brandDiscussHtml(await res.text())
    outHeaders.delete('etag')
    outHeaders.delete('last-modified')
    outHeaders.set('content-length', String(Buffer.byteLength(html)))
    return new Response(html, { status: res.status, headers: outHeaders })
  }

  const buf = Buffer.from(await res.arrayBuffer())
  outHeaders.set('content-length', String(buf.byteLength))
  return new Response(buf, { status: res.status, headers: outHeaders })
}

async function proxyGameplan(c: Context) {
  return proxyToUpstream(c, GAMEPLAN_UPSTREAM)
}

/**
 * Bridge JWT alone is not enough: Gameplan boots from Frappe `user_id`/`sid`.
 * Without those cookies the SPA route matches but App.vue renders an empty shell.
 */
function requireDiscussSessions(c: Context): Response | null {
  if (!sessionFromRequest(c)) {
    return c.html(renderDiscussWelcomeHtml({ studioUrl: STUDIO_URL }), 401)
  }
  if (!hasFrappeSessionCookies(c.req.header('cookie'))) {
    c.header('Set-Cookie', clearSessionCookie())
    return c.html(renderDiscussWelcomeHtml({ studioUrl: STUDIO_URL }), 401)
  }
  return null
}

async function proxyGameplanAuthenticated(c: Context) {
  const denied = requireDiscussSessions(c)
  if (denied) return denied
  const url = new URL(c.req.url)
  const rewritten = rewriteLegacyGameplanPath(url.pathname)
  if (rewritten && rewritten !== url.pathname) {
    return c.redirect(`${rewritten}${url.search}`)
  }
  return proxyGameplan(c)
}

app.all('/g/*', proxyGameplanAuthenticated)
/** Legacy handoff used Gameplan doc-name paths; redirect to keyed path when session exists. */
app.all('/community/*', (c) => {
  const denied = requireDiscussSessions(c)
  if (denied) return denied
  const session = sessionFromRequest(c)!
  const map = buildDiscussSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  return c.redirect(gameplanSpacePath(map))
})
app.all('/space/*', proxyGameplanAuthenticated)
app.all('/assets/*', proxyGameplan)
app.all('/files/*', proxyGameplanAuthenticated)
app.all('/api/method/*', async (c) => {
  const path = new URL(c.req.url).pathname
  if (isNativeAuthPath(path)) return c.redirect(`${STUDIO_URL}/sign-in`)
  // Handoff exchange is called server-side from /sso/session — still allow proxied methods
  // for the signed-in SPA (needs session cookie from Frappe).
  if (path.includes('indobase_discuss.api.studio_handoff')) {
    return proxyGameplan(c)
  }
  const denied = requireDiscussSessions(c)
  if (denied) return c.json({ error: 'unauthorized' }, 401)
  return proxyGameplan(c)
})
/** Gameplan Vite client uses Frappe RPC v2 for boot (users, resources). */
app.all('/api/v2/*', async (c) => {
  const denied = requireDiscussSessions(c)
  if (denied) return c.json({ error: 'unauthorized' }, 401)
  return proxyGameplan(c)
})
app.all('/api/resource/*', proxyGameplanAuthenticated)
app.all('/api/frappe/*', proxyGameplanAuthenticated)
app.all('/socket.io/*', async (c) => {
  const denied = requireDiscussSessions(c)
  if (denied) return denied
  return proxyToUpstream(c, SOCKET_UPSTREAM || GAMEPLAN_UPSTREAM)
})

/** Frappe native login is disabled — Studio SSO is the only sign-in surface. */
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.redirect(`${STUDIO_URL}/sign-in`)
})

// ── Dev shell / cold landing ─────────────────────────────────────────────────

function renderShell(session: Session): string {
  const map = buildDiscussSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  const path = gameplanSpacePath(map)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Discuss</title>
  <link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
  <style>
    :root { --brand: #3B8FD6; --ink: #0f172a; --muted: #64748b; --surface: #fff; --border: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; color: var(--ink); }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
    header strong { color: var(--brand); }
    main { max-width: 960px; margin: 32px auto; padding: 0 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .meta { color: var(--muted); font-size: 14px; margin-top: 8px; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; font-size: 14px; }
    dt { color: var(--muted); }
    code { background: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .pill { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  </style>
</head>
<body>
  <header><strong>Indobase Discuss</strong><span class="pill">Team chat</span></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${map.spaceTitle}</h1>
      <p class="meta">${map.teamTitle} · signed in as ${session.email}</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0" />
      <dl>
        <dt>Organization</dt><dd><code>${map.orgSlug}</code> → team <code>${map.teamKey}</code></dd>
        <dt>Project</dt><dd><code>${map.projectRef}</code> → space <code>${map.spaceKey}</code></dd>
        <dt>Deep link</dt><dd><code>${path}</code></dd>
        <dt>Role</dt><dd>${session.role}${session.canPost ? '' : ' (view only)'}</dd>
      </dl>
      <p class="meta" style="margin-top:20px">
        Dev shell — production serves the full Discuss experience.
        SSO bridge is live; Studio handoff contract verified.
      </p>
    </div>
  </main>
</body>
</html>`
}

app.get('/', (c) => {
  const session = sessionFromRequest(c)
  if (!session || !hasFrappeSessionCookies(c.req.header('cookie'))) {
    if (session && !hasFrappeSessionCookies(c.req.header('cookie'))) {
      c.header('Set-Cookie', clearSessionCookie())
    }
    return c.html(renderDiscussWelcomeHtml({ studioUrl: STUDIO_URL }))
  }
  if (GAMEPLAN_UPSTREAM) {
    const map = buildDiscussSpaceMap({
      orgSlug: session.orgSlug,
      projectRef: session.projectRef,
      projectName: session.projectName,
      organizationName: session.organizationName,
    })
    return c.redirect(gameplanSpacePath(map))
  }
  return c.html(renderShell(session))
})

app.all('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname
  if (isBridgeOwnedPath(pathname)) return next()
  if (isNativeAuthPath(pathname)) return c.redirect(`${STUDIO_URL}/sign-in`)
  if (!GAMEPLAN_UPSTREAM) {
    if (pathname === '/') return next()
    return c.html(renderDiscussWelcomeHtml({ studioUrl: STUDIO_URL }))
  }
  const denied = requireDiscussSessions(c)
  if (denied) return denied
  return proxyGameplan(c)
})

// ── Boot ─────────────────────────────────────────────────────────────────────

function proxySocketUpgrade(req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) {
  const upstreamBase = SOCKET_UPSTREAM || GAMEPLAN_UPSTREAM
  if (!upstreamBase) {
    socket.destroy()
    return
  }
  let target: URL
  try {
    target = new URL(upstreamBase)
  } catch {
    socket.destroy()
    return
  }
  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : ''
  let secret = ''
  try {
    secret = resolveHandoffSecret()
  } catch {
    socket.destroy()
    return
  }
  const session = readSessionToken(readCookie(cookie) || '', secret)
  if (!session || !hasFrappeSessionCookies(cookie)) {
    socket.destroy()
    return
  }

  const isTls = target.protocol === 'https:'
  const transport = isTls ? httpsRequest : httpRequest
  const headers = {
    ...req.headers,
    host: DISCUSS_SITE_NAME,
    'x-frappe-site-name': DISCUSS_SITE_NAME,
  }
  const proxyReq = transport({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTls ? 443 : 80),
    path: req.url || '/',
    method: req.method,
    headers,
  })
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [`HTTP/1.1 101 Switching Protocols`]
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (v === undefined) continue
      if (Array.isArray(v)) {
        for (const item of v) lines.push(`${k}: ${item}`)
      } else {
        lines.push(`${k}: ${v}`)
      }
    }
    lines.push('', '')
    socket.write(lines.join('\r\n'))
    if (proxyHead.length) socket.write(proxyHead)
    if (head.length) proxySocket.write(head)
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })
  proxyReq.on('error', () => {
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
  })
  socket.on('error', () => {
    try {
      proxyReq.destroy()
    } catch {
      /* ignore */
    }
  })
  proxyReq.end()
}

export function startDiscussBridge(listenPort = Number(process.env.PORT || 8092)) {
  const listener = getRequestListener(app.fetch)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => listener(req, res))
  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '/'
    if (!url.startsWith('/socket.io')) {
      socket.destroy()
      return
    }
    proxySocketUpgrade(req, socket, head)
  })
  server.listen(listenPort, () => {
    console.log(`[indobase-discuss] listening on :${listenPort}`)
  })
  return server
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))

if (isMain) {
  startDiscussBridge()
}

export { sanitizeProxiedResponseHeaders }
export default app
