/**
 * Indobase Meet — Studio SSO bridge + branded reverse proxy to the Meet engine.
 *
 * Studio hands off to `/sso/launch#token=…`. Bridge exchanges the JWT for a
 * session cookie, maps org/project → meeting space, and serves `/meeting/{id}`.
 * Customer UI is branded Indobase Meet only — no upstream engine names in chrome we control.
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
  displayNameFromEmail,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  sessionCookie,
  verifyStudioHandoff,
  type Session,
} from './auth.js'
import { brandMeetHtml, shouldBrandMeetResponse } from './brand-html.js'
import {
  acceptMeetEvent,
  acceptRoomLinkEvent,
  getLinkedRoom,
  isMeetEventEnvelope,
  linkMeetRoom,
} from './events.js'
import {
  engineJwtConfigured,
  meetConfigOverwrite,
  meetInterfaceConfig,
  MEET_PRODUCT_NAME,
  mintEngineRoomJwt,
} from './jitsi-jwt.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'
import { buildMeetSpaceMap, meetMeetingPath } from './space-map.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const ENGINE_URL = (process.env.MEET_ENGINE_URL || process.env.JITSI_WEB_URL || '').replace(/\/+$/, '')
const PUBLIC_ORIGIN = (process.env.MEET_PUBLIC_URL || 'https://meet.indobase.in').replace(/\/+$/, '')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_ROOT = path.resolve(__dirname, '../public')

function isBridgeOwnedPath(pathname: string): boolean {
  return (
    pathname === '/healthz' ||
    pathname === '/api/me' ||
    pathname === '/api/events' ||
    pathname.startsWith('/api/rooms') ||
    pathname.startsWith('/sso/') ||
    pathname === '/sso' ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/meeting/')
  )
}

function safeMeetingId(raw: string | undefined | null): string | null {
  const id = (raw || '').trim()
  if (!id || !/^ib-meet-[a-z0-9-]{1,56}$/i.test(id)) return null
  return id.slice(0, 64)
}

function isNativeAuthPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/static/login' ||
    pathname.startsWith('/user-login') ||
    pathname.includes('password') ||
    pathname.includes('register') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/')
  )
}

app.use(
  '/brand/*',
  serveStatic({
    root: PUBLIC_ROOT,
  })
)

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening Indobase Meet…</title>
<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
</head>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#0f172a;background:#f8fafc">
<div style="text-align:center">
  <img src="/brand/indobase-logo-mark-80.png" alt="" width="48" height="48" style="display:block;margin:0 auto 16px" />
  <p style="margin:0;font-weight:600;font-size:15px">Opening Indobase Meet…</p>
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
      '<div style="max-width:34rem"><p style="font-weight:600;margin:0 0 8px">Could not open this meeting</p>' +
      '<p style="margin:0 0 8px;color:#475569;font-size:14px">' + (reason || ('The handoff was rejected (HTTP ' + r.status + ').')) + '</p>' +
      (r.status === 401
        ? '<p style="margin:0 0 16px;color:#64748b;font-size:13px">This usually means the handoff secret does not match between Studio and Meet.</p>'
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
    console.error('[meet] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildMeetSpaceMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })

  const meetingOverride =
    safeMeetingId(claims.meeting_id) ||
    safeMeetingId(c.req.query('meeting')) ||
    null
  const redirect = meetingOverride
    ? `/meeting/${encodeURIComponent(meetingOverride)}`
    : meetMeetingPath(map)

  if (meetingOverride) {
    linkMeetRoom({
      meetingId: meetingOverride,
      projectRef: claims.project_ref,
      orgSlug: claims.organization_slug,
      source: 'sso',
      inviteUrl: `${PUBLIC_ORIGIN}/meeting/${encodeURIComponent(meetingOverride)}`,
    })
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, space: map, meetingId: meetingOverride || map.meetingId })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', async (c) => {
  const body = publicSsoHealth({
    service: 'indobase-meet',
    audience: AUDIENCE,
    versionEnvKeys: ['MEET_VERSION', 'GIT_SHA'],
  })
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  ;(body as { upstreamReady?: boolean; engineJwt?: boolean }).upstreamReady = !!ENGINE_URL
  ;(body as { engineJwt?: boolean }).engineJwt = engineJwtConfigured()
  return c.json(body)
})

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
  const map = buildMeetSpaceMap({
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
    meetRole: s.meetRole,
    isModerator: s.isModerator,
    studioUrl: s.studioUrl,
    space: map,
    meetingPath: meetMeetingPath(map),
  })
})

app.post('/api/events', requireSession, async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }
  if (!isMeetEventEnvelope(body)) {
    return c.json({ error: 'type required' }, 400)
  }
  if (
    body.type === 'calendar.meet.linked' ||
    body.type === 'discuss.call.started' ||
    body.type === 'meet.room.linked'
  ) {
    try {
      return c.json(acceptRoomLinkEvent(body))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'invalid room link' }, 400)
    }
  }
  return c.json(acceptMeetEvent(body))
})

/**
 * Bridge-to-bridge room link (Calendar / Discuss). Accepts a short Meet handoff
 * JWT so callers do not need a browser session cookie.
 */
app.post('/api/rooms/link', async (c) => {
  let body: {
    token?: string
    meetingId?: string
    source?: string
    scope?: string
    inviteUrl?: string
  }
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }
  const token = (body.token || '').trim()
  if (!token) return c.json({ error: 'token required' }, 400)

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 'sso not configured' }, 503)
  }
  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const meetingId =
    safeMeetingId(body.meetingId) ||
    safeMeetingId(claims.meeting_id) ||
    buildMeetSpaceMap({
      orgSlug: claims.organization_slug,
      projectRef: claims.project_ref,
    }).meetingId

  const inviteUrl =
    (typeof body.inviteUrl === 'string' && body.inviteUrl.trim()) ||
    `${PUBLIC_ORIGIN}/meeting/${encodeURIComponent(meetingId)}`

  const room = linkMeetRoom({
    meetingId,
    projectRef: claims.project_ref,
    orgSlug: claims.organization_slug,
    source: (body.source || 'bridge').slice(0, 32),
    scope: typeof body.scope === 'string' ? body.scope.slice(0, 32) : undefined,
    inviteUrl,
  })

  acceptMeetEvent({
    type: 'meet.room.linked',
    meetingId: room.meetingId,
    projectRef: room.projectRef,
    orgSlug: room.orgSlug,
    payload: { source: room.source, scope: room.scope, inviteUrl: room.inviteUrl },
    ts: room.linkedAt,
  })

  return c.json({
    ok: true,
    room,
    meetingPath: `/meeting/${encodeURIComponent(meetingId)}`,
  })
})

app.get('/api/rooms/:meetingId', requireSession, (c) => {
  const meetingId = safeMeetingId(c.req.param('meetingId'))
  if (!meetingId) return c.json({ error: 'invalid meeting id' }, 400)
  const linked = getLinkedRoom(meetingId)
  return c.json({
    ok: true,
    meetingId,
    meetingPath: `/meeting/${encodeURIComponent(meetingId)}`,
    inviteUrl: `${PUBLIC_ORIGIN}/meeting/${encodeURIComponent(meetingId)}`,
    linked: linked || null,
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-meet' }))

function trySession(c: Context): Session | null {
  try {
    const secret = resolveHandoffSecret()
    const raw = readCookie(c.req.header('cookie'))
    return raw ? readSessionToken(raw, secret) : null
  } catch {
    return null
  }
}

function renderMeetingPage(session: Session, meetingId: string): string {
  const map = buildMeetSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  const roomName = meetingId || map.meetingId
  const host = (() => {
    try {
      return new URL(PUBLIC_ORIGIN).host
    } catch {
      return 'meet.indobase.in'
    }
  })()
  const jwt =
    mintEngineRoomJwt({
      roomName,
      session,
      subject: host,
    }) || ''
  const brandLogoUrl = `${PUBLIC_ORIGIN}/brand/indobase-logo-wordmark.svg`
  const config = meetConfigOverwrite(map.meetingTitle || MEET_PRODUCT_NAME)
  const iface = meetInterfaceConfig(brandLogoUrl)
  const displayName = displayNameFromEmail(session.email)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${MEET_PRODUCT_NAME}</title>
  <link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
  <style>
    :root { --brand: #3B8FD6; --ink: #0f172a; --muted: #64748b; --bg: #0b1220; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: var(--bg); color: #fff; font-family: system-ui, sans-serif; }
    header {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px;
      background: rgba(15, 23, 42, 0.92); border-bottom: 1px solid rgba(148,163,184,0.2);
    }
    header strong { color: var(--brand); font-size: 14px; }
    header .meta { color: var(--muted); font-size: 12px; margin-left: auto; }
    #meet-root { height: calc(100% - 48px); width: 100%; }
    .splash { display: grid; place-items: center; height: 100%; text-align: center; padding: 24px; }
    .splash img { display: block; margin: 0 auto 16px; }
    .err { color: #fca5a5; font-size: 14px; margin-top: 12px; }
  </style>
</head>
<body>
  <header>
    <img src="/brand/indobase-logo-mark-80.png" alt="" width="24" height="24" />
    <strong>${MEET_PRODUCT_NAME}</strong>
    <span class="meta">${escapeHtml(map.meetingTitle)} · ${escapeHtml(session.meetRole)} · ${escapeHtml(session.email)}</span>
  </header>
  <div id="meet-root">
    <div class="splash" id="splash">
      <div>
        <img src="/brand/indobase-logo-mark-80.png" alt="" width="48" height="48" />
        <p style="margin:0;font-weight:600">Joining meeting…</p>
        <p class="err" id="err" hidden></p>
      </div>
    </div>
  </div>
  <script>
  (function () {
    var DOMAIN = ${JSON.stringify(host)};
    var ROOM = ${JSON.stringify(roomName)};
    var JWT = ${JSON.stringify(jwt)};
    var DISPLAY = ${JSON.stringify(displayName)};
    var EMAIL = ${JSON.stringify(session.email)};
    var CONFIG = ${JSON.stringify(config)};
    var IFACE = ${JSON.stringify(iface)};
    var ENGINE = ${JSON.stringify(ENGINE_URL ? '/engine/external_api.js' : '')};
    var errEl = document.getElementById('err');
    var splash = document.getElementById('splash');
    var root = document.getElementById('meet-root');

    function showErr(msg) {
      if (!errEl) return;
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    }

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('Could not load meeting client')); };
        document.head.appendChild(s);
      });
    }

    async function boot() {
      if (!ENGINE) {
        showErr('Meet media engine is not configured on this deployment yet.');
        return;
      }
      try {
        await loadScript(ENGINE);
        if (!window.JitsiMeetExternalAPI) throw new Error('Meeting client missing');
        if (splash) splash.remove();
        var options = {
          roomName: ROOM,
          parentNode: root,
          width: '100%',
          height: '100%',
          userInfo: { displayName: DISPLAY, email: EMAIL },
          configOverwrite: CONFIG,
          interfaceConfigOverwrite: IFACE
        };
        if (JWT) options.jwt = JWT;
        new window.JitsiMeetExternalAPI(DOMAIN, options);
        try {
          fetch('/api/events', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'meet.joined',
              meetingId: ROOM,
              projectRef: ${JSON.stringify(session.projectRef)},
              orgSlug: ${JSON.stringify(session.orgSlug)},
              ts: Date.now()
            })
          }).catch(function () {});
        } catch (_) {}
      } catch (e) {
        showErr((e && e.message) || 'Could not join meeting');
      }
    }
    boot();
  })();
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderDevShell(session: Session): string {
  const map = buildMeetSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  const path = meetMeetingPath(map)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Meet</title>
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
    a.btn { display: inline-block; margin-top: 16px; background: var(--brand); color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <header><strong>Indobase Meet</strong></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${escapeHtml(map.meetingTitle)}</h1>
      <p class="meta">${escapeHtml(map.orgTitle)} · ${escapeHtml(session.email)} · ${escapeHtml(session.meetRole)}</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0" />
      <dl>
        <dt>Organization</dt><dd><code>${escapeHtml(map.orgSlug)}</code> → <code>${escapeHtml(map.orgKey)}</code></dd>
        <dt>Project</dt><dd><code>${escapeHtml(map.projectRef)}</code> → meeting <code>${escapeHtml(map.meetingId)}</code></dd>
        <dt>Deep link</dt><dd><code>${escapeHtml(path)}</code></dd>
        <dt>Role</dt><dd>${escapeHtml(session.meetRole)}${session.isModerator ? ' (moderator)' : ''}</dd>
      </dl>
      <a class="btn" href="${escapeHtml(path)}">Open meeting</a>
      <p class="meta" style="margin-top:20px">
        Dev shell — set MEET_ENGINE_URL to proxy the media engine. SSO bridge is live.
      </p>
    </div>
  </main>
</body>
</html>`
}

app.get('/meeting/:meetingId', (c) => {
  const session = trySession(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const meetingId = c.req.param('meetingId')
  if (ENGINE_URL) {
    return c.html(renderMeetingPage(session, meetingId))
  }
  return c.html(renderMeetingPage(session, meetingId).replace(
    'Meet media engine is not configured on this deployment yet.',
    'Dev mode: media engine URL not set — SSO and branding are live. Set MEET_ENGINE_URL for A/V.'
  ))
})

app.get('/', (c) => {
  const session = trySession(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const map = buildMeetSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  if (ENGINE_URL) return c.redirect(meetMeetingPath(map))
  return c.html(renderDevShell(session))
})

/** Strip hop/encoding headers undici has already resolved on the decoded body. */
export function sanitizeProxiedResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('server')
  out.delete('x-powered-by')
  out.delete('content-encoding')
  out.delete('content-length')
  out.delete('transfer-encoding')
  return out
}

async function proxyEngine(c: Context, enginePath: string) {
  if (!ENGINE_URL) return c.notFound()
  const url = new URL(c.req.url)
  const target = `${ENGINE_URL}${enginePath}${url.search}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  headers.delete('accept-encoding')
  const res = await fetch(target, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
    redirect: 'manual',
  })
  const outHeaders = sanitizeProxiedResponseHeaders(res.headers)
  const contentType = res.headers.get('content-type')
  if (shouldBrandMeetResponse(contentType) && c.req.method !== 'HEAD') {
    const html = brandMeetHtml(await res.text())
    outHeaders.delete('content-length')
    return new Response(html, { status: res.status, headers: outHeaders })
  }
  return new Response(res.body, { status: res.status, headers: outHeaders })
}

app.all('/engine/*', async (c) => {
  const pathname = new URL(c.req.url).pathname.replace(/^\/engine/, '') || '/'
  return proxyEngine(c, pathname)
})

app.all('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname
  if (isBridgeOwnedPath(pathname)) return next()
  if (isNativeAuthPath(pathname)) return c.redirect(`${STUDIO_URL}/sign-in`)
  if (!ENGINE_URL) {
    if (pathname === '/') return next()
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  return proxyEngine(c, pathname)
})

export function startMeetBridge(listenPort = Number(process.env.PORT || 8094)) {
  const listener = getRequestListener(app.fetch)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => listener(req, res))

  server.on('upgrade', (req, socket, head) => {
    if (!ENGINE_URL) {
      socket.destroy()
      return
    }
    let target: URL
    try {
      target = new URL(ENGINE_URL)
    } catch {
      socket.destroy()
      return
    }
    const isTls = target.protocol === 'https:'
    const transport = isTls ? httpsRequest : httpRequest
    let reqPath = req.url || '/'
    if (reqPath.startsWith('/engine')) {
      reqPath = reqPath.slice('/engine'.length) || '/'
    }
    const headers = { ...req.headers, host: target.host }
    const proxyReq = transport({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isTls ? 443 : 80),
      path: reqPath,
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
    console.log(`[indobase-meet] listening on :${listenPort}`)
  })
  return server
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  startMeetBridge()
}

export default app
