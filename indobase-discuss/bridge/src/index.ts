/**
 * Indobase Discuss — Studio SSO bridge + Mattermost reverse proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. Bridge exchanges the JWT for a
 * Mattermost browser session (MMAUTHTOKEN) and proxies the app. Customer UI is
 * branded Indobase Discuss only — no upstream product names in chrome we control.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'

import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'

import {
  AUDIENCE,
  clearSessionCookie,
  createSessionToken,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  sessionCookie,
  verifyStudioHandoff,
  type Session,
} from './auth.js'
import { brandDiscussHtml, shouldBrandDiscussResponse } from './brand-html.js'
import {
  exchangeStudioClaimsForMattermost,
  isMattermostConfigured,
  mattermostPing,
  mattermostSessionCookies,
} from './mattermost.js'
import { buildDiscussSpaceMap, discussChannelPath } from './space-map.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const MATTERMOST_URL = (process.env.MATTERMOST_URL || '').replace(/\/+$/, '')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_ROOT = path.resolve(__dirname, '../public')

function isBridgeOwnedPath(pathname: string): boolean {
  return (
    pathname === '/healthz' ||
    pathname === '/api/me' ||
    pathname.startsWith('/sso/') ||
    pathname === '/sso' ||
    pathname.startsWith('/brand/')
  )
}

// Brand assets (copied from packages/common/assets/brand)
app.use(
  '/brand/*',
  serveStatic({
    root: PUBLIC_ROOT,
  })
)

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase Discuss…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase Discuss…</p>
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
      '<a href="' + ${JSON.stringify(STUDIO_URL)} + '" style="font-size:14px;color:#2563eb">Back to Indobase Studio</a></div></div>';
    return;
  }
  var dest = '/';
  try {
    var body = await r.json();
    if (body && body.redirect) dest = body.redirect;
  } catch (_) {}
  location.replace(dest);
})();
</script></body>`)
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

  let redirect = discussChannelPath(map)

  if (isMattermostConfigured()) {
    try {
      const mm = await exchangeStudioClaimsForMattermost(claims, map, secret)
      for (const cookie of mattermostSessionCookies(mm)) {
        c.res.headers.append('Set-Cookie', cookie)
      }
      redirect = mm.redirect
    } catch (err) {
      console.error('[discuss] upstream handoff failed:', err)
      return c.json(
        {
          error:
            err instanceof Error && err.message
              ? err.message
              : 'Could not open Discuss. Try again from Studio.',
        },
        502
      )
    }
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, space: map })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  c.res.headers.append('Set-Cookie', 'MMAUTHTOKEN=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
  c.res.headers.append('Set-Cookie', 'MMUSERID=; Path=/; Secure; SameSite=Lax; Max-Age=0')
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
  // Do not leak upstream hostnames — only a boolean readiness bit.
  ;(body as { upstreamReady?: boolean }).upstreamReady = isMattermostConfigured()
    ? await mattermostPing()
    : false
  return c.json(body)
})

// ── Auth helpers (bridge-owned API only) ─────────────────────────────────────

async function requireSession(c: Context<{ Variables: Vars }>, next: Next) {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 'sso not configured' }, 503)
  }
  const raw = readCookie(c.req.header('cookie'))
  const session = raw ? readSessionToken(raw, secret) : null
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
    channelPath: discussChannelPath(map),
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-discuss' }))

function isNativeAuthPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup_user_complete' ||
    pathname === '/signup_email' ||
    pathname.startsWith('/signup_')
  )
}

// ── Dev shell (no Mattermost upstream) ───────────────────────────────────────

function renderShell(session: Session): string {
  const map = buildDiscussSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  const path = discussChannelPath(map)
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
        <dt>Project</dt><dd><code>${map.projectRef}</code> → channel <code>${map.spaceKey}</code></dd>
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
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  const raw = readCookie(c.req.header('cookie'))
  const session = raw ? readSessionToken(raw, secret) : null
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  if (MATTERMOST_URL) {
    const map = buildDiscussSpaceMap({
      orgSlug: session.orgSlug,
      projectRef: session.projectRef,
      projectName: session.projectName,
      organizationName: session.organizationName,
    })
    return c.redirect(discussChannelPath(map))
  }
  return c.html(renderShell(session))
})

// ── Mattermost HTTP proxy (non-bridge paths) ─────────────────────────────────

/** Strip hop/encoding headers undici has already resolved on the decoded body. */
export function sanitizeProxiedResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('server')
  out.delete('x-version-id')
  // undici already decoded gzip/br. Keeping Content-Encoding (and the compressed
  // Content-Length) makes browsers gunzip plaintext CSS/JS → assets fail → the
  // Mattermost LoadingScreen SVG pills fill the viewport as giant black shapes.
  out.delete('content-encoding')
  out.delete('content-length')
  return out
}

async function proxyMattermost(c: Context) {
  if (!MATTERMOST_URL) return c.notFound()
  const url = new URL(c.req.url)
  const target = `${MATTERMOST_URL}${url.pathname}${url.search}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  // Node fetch/undici decompresses responses; do not advertise encodings we
  // cannot faithfully re-encode when streaming the decoded body.
  headers.delete('accept-encoding')
  const res = await fetch(target, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
    redirect: 'manual',
  })
  // Clone via sanitize — res.headers is immutable; securityHeaders must .set().
  const outHeaders = sanitizeProxiedResponseHeaders(res.headers)
  const contentType = res.headers.get('content-type')
  if (shouldBrandDiscussResponse(contentType) && c.req.method !== 'HEAD') {
    const html = brandDiscussHtml(await res.text())
    outHeaders.delete('content-length')
    return new Response(html, { status: res.status, headers: outHeaders })
  }
  return new Response(res.body, { status: res.status, headers: outHeaders })
}

app.all('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (isBridgeOwnedPath(path)) return next()
  if (isNativeAuthPath(path)) return c.redirect(`${STUDIO_URL}/sign-in`)
  if (!MATTERMOST_URL) {
    if (path === '/') return next()
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  return proxyMattermost(c)
})

// ── Boot (HTTP + WebSocket upgrade to Mattermost) ────────────────────────────

export function startDiscussBridge(listenPort = Number(process.env.PORT || 8092)) {
  const listener = getRequestListener(app.fetch)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => listener(req, res))

  server.on('upgrade', (req, socket, head) => {
    if (!MATTERMOST_URL) {
      socket.destroy()
      return
    }
    let target: URL
    try {
      target = new URL(MATTERMOST_URL)
    } catch {
      socket.destroy()
      return
    }
    const isTls = target.protocol === 'https:'
    const transport = isTls ? httpsRequest : httpRequest
    const headers = { ...req.headers, host: target.host }
    const proxyReq = transport({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isTls ? 443 : 80),
      path: req.url,
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
  })

  server.listen(listenPort, () => {
    console.log(`[indobase-discuss] listening on :${listenPort}`)
  })
  return server
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  startDiscussBridge()
}

export default app
