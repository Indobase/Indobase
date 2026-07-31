/**
 * Indobase Calendar — Studio SSO bridge + scheduling-app reverse proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. Bridge exchanges the JWT for an
 * engine browser session and proxies the app. Customer UI is branded
 * Indobase Calendar only — no upstream product names in chrome we control.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
import { brandCalendarHtml, shouldBrandCalendarResponse } from './brand-html.js'
import {
  exchangeStudioClaimsForCalendar,
  engineSessionCookies,
  isCalendarEngineConfigured,
  calendarEnginePing,
} from './engine.js'
import { buildMeetAttachStub } from './meet-stub.js'
import { rewriteProductPath } from './routes.js'
import { buildCalendarSpaceMap, calendarEventsPath } from './space-map.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const CALENDAR_APP_URL = (
  process.env.CALENDAR_APP_URL ||
  process.env.CALENDAR_INTERNAL_URL ||
  ''
).replace(/\/+$/, '')

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

app.use(
  '/brand/*',
  serveStatic({
    root: PUBLIC_ROOT,
  })
)

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening Indobase Calendar…</title>
<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
</head>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#0f172a;background:#f8fafc">
<div style="text-align:center">
  <img src="/brand/indobase-logo-mark-80.png" alt="" width="48" height="48" style="display:block;margin:0 auto 16px" />
  <p style="margin:0;font-weight:600;font-size:15px;color:#3B8FD6">Opening Indobase Calendar…</p>
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
      '<div style="max-width:34rem"><p style="font-weight:600;margin:0 0 8px">Could not open Calendar</p>' +
      '<p style="margin:0 0 8px;color:#475569;font-size:14px">' + (reason || ('The handoff was rejected (HTTP ' + r.status + ').')) + '</p>' +
      (r.status === 401
        ? '<p style="margin:0 0 16px;color:#64748b;font-size:13px">This usually means the handoff secret does not match between Studio and this service.</p>'
        : '') +
      '<a href="' + ${JSON.stringify(STUDIO_URL)} + '" style="font-size:14px;color:#3B8FD6">Back to Indobase Studio</a></div></div>';
    return;
  }
  var dest = ${JSON.stringify(calendarEventsPath())};
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
    console.error('[calendar] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildCalendarSpaceMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })

  let redirect = calendarEventsPath()

  if (isCalendarEngineConfigured()) {
    try {
      const engine = await exchangeStudioClaimsForCalendar(claims, map, secret)
      for (const cookie of engineSessionCookies(engine)) {
        c.res.headers.append('Set-Cookie', cookie)
      }
      redirect = engine.redirect
    } catch (err) {
      console.error('[calendar] upstream handoff failed:', err)
      return c.json(
        {
          error:
            err instanceof Error && err.message
              ? err.message
              : 'Could not open Calendar. Try again from Studio.',
        },
        502
      )
    }
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({
    ok: true,
    redirect,
    space: map,
    meet: buildMeetAttachStub(claims.project_ref),
  })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', async (c) => {
  const body = publicSsoHealth({
    service: 'indobase-calendar',
    audience: AUDIENCE,
    versionEnvKeys: ['CALENDAR_VERSION', 'GIT_SHA'],
  })
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  ;(body as { upstreamReady?: boolean }).upstreamReady = isCalendarEngineConfigured()
    ? await calendarEnginePing()
    : false
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
  const map = buildCalendarSpaceMap({
    orgSlug: s.orgSlug,
    projectRef: s.projectRef,
    projectName: s.projectName,
    organizationName: s.organizationName,
  })
  return c.json({
    email: s.email,
    displayName: displayNameFromEmail(s.email),
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    calendarRole: s.calendarRole,
    canManage: s.canManage,
    canEdit: s.canEdit,
    studioUrl: s.studioUrl,
    space: map,
    eventsPath: calendarEventsPath(),
    meet: buildMeetAttachStub(s.projectRef),
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-calendar' }))

function isNativeAuthPath(pathname: string): boolean {
  return (
    pathname === '/auth/login' ||
    pathname === '/auth/signup' ||
    pathname === '/signup' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/forgot-password') ||
    pathname.startsWith('/auth/reset') ||
    pathname === '/api/auth/signin' ||
    pathname === '/api/auth/signup'
  )
}

function renderShell(session: Session): string {
  const map = buildCalendarSpaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
  const meet = buildMeetAttachStub(session.projectRef)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Calendar</title>
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
    dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; font-size: 14px; }
    dt { color: var(--muted); }
    code { background: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .pill { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    nav a { color: var(--brand); margin-right: 16px; font-size: 14px; text-decoration: none; }
  </style>
</head>
<body>
  <header><strong>Indobase Calendar</strong><span class="pill">${session.calendarRole}</span></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${map.spaceTitle}</h1>
      <p class="meta">${map.teamTitle} · signed in as ${session.email}</p>
      <nav style="margin:16px 0">
        <a href="/events">Events</a>
        <a href="/team">Team</a>
        <a href="/settings">Settings</a>
      </nav>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0" />
      <dl>
        <dt>Organization</dt><dd><code>${map.orgSlug}</code> → <code>${map.orgKey}</code></dd>
        <dt>Project</dt><dd><code>${map.projectRef}</code> → booking <code>${map.projectUsername}</code></dd>
        <dt>Role</dt><dd>${session.calendarRole}${session.canEdit ? '' : ' (view only)'}</dd>
        <dt>Meet link</dt><dd><code>${meet.meetLink}</code></dd>
      </dl>
      <p class="meta" style="margin-top:20px">
        Dev shell — production serves the full Calendar experience behind this SSO bridge.
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
  if (CALENDAR_APP_URL) {
    return c.redirect(calendarEventsPath())
  }
  return c.html(renderShell(session))
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

async function proxyCalendar(c: Context, upstreamPath: string) {
  if (!CALENDAR_APP_URL) return c.notFound()
  const url = new URL(c.req.url)
  const target = `${CALENDAR_APP_URL}${upstreamPath}${url.search}`
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
  if (shouldBrandCalendarResponse(contentType) && c.req.method !== 'HEAD') {
    const html = brandCalendarHtml(await res.text())
    outHeaders.delete('content-length')
    outHeaders.delete('content-encoding')
    outHeaders.delete('transfer-encoding')
    return new Response(html, { status: res.status, headers: outHeaders })
  }
  return new Response(res.body, { status: res.status, headers: outHeaders })
}

app.all('*', async (c, next) => {
  const pathName = new URL(c.req.url).pathname
  if (isBridgeOwnedPath(pathName)) return next()
  if (isNativeAuthPath(pathName)) return c.redirect(`${STUDIO_URL}/sign-in`)

  // Product path aliases
  const rewritten = rewriteProductPath(pathName)
  if (rewritten && rewritten !== pathName && CALENDAR_APP_URL) {
    return proxyCalendar(c, rewritten)
  }

  if (!CALENDAR_APP_URL) {
    if (pathName === '/' || pathName === '/events' || pathName === '/team' || pathName === '/settings') {
      let secret: string
      try {
        secret = resolveHandoffSecret()
      } catch {
        return c.redirect(`${STUDIO_URL}/sign-in`)
      }
      const raw = readCookie(c.req.header('cookie'))
      const session = raw ? readSessionToken(raw, secret) : null
      if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
      return c.html(renderShell(session))
    }
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  return proxyCalendar(c, pathName)
})

export function startCalendarBridge(listenPort = Number(process.env.PORT || 8095)) {
  const listener = getRequestListener(app.fetch)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => listener(req, res))
  server.listen(listenPort, () => {
    console.log(`[indobase-calendar] listening on :${listenPort}`)
  })
  return server
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  startCalendarBridge()
}

export default app
