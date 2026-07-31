/**
 * Indobase Helpdesk — SSO bridge and optional Frappe Helpdesk proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. When `HELPDESK_UPSTREAM` is set, authenticated
 * `/h/*`, `/portal/*`, and `/helpdesk/*` requests proxy to the Frappe Helpdesk frontend;
 * otherwise a dev shell renders.
 */
import { serve } from '@hono/node-server'
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
import {
  buildHelpdeskScopeMap,
  helpdeskAgentPath,
  helpdeskPortalPath,
  upstreamHelpdeskPath,
} from './helpdesk-map.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const HELPDESK_UPSTREAM = (process.env.HELPDESK_UPSTREAM || '').replace(/\/+$/, '')
const FRAPPE_HANDOFF_URL = (process.env.FRAPPE_STUDIO_HANDOFF_URL || '').replace(/\/+$/, '')

function scopeFromSession(session: Session) {
  return buildHelpdeskScopeMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
}

function redirectForSession(session: Session): string {
  const map = scopeFromSession(session)
  return session.isAgent ? helpdeskAgentPath(map) : helpdeskPortalPath(map)
}

// ── SSO ──────────────────────────────────────────────────────────────────────

/**
 * Frappe login sets multiple cookies (sid, system_user, …) and `headers.get('set-cookie')` returns
 * only the first. Forward all of them, and append rather than assign — `c.header()` replaces, so
 * setting the bridge's own cookie afterwards used to discard Frappe's `sid` entirely. The SPA then
 * booted with no Frappe session and rendered a blank page.
 */
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

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase Helpdesk…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase Helpdesk…</p>
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
    console.error('[helpdesk] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildHelpdeskScopeMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })

  const isAgent = ['owner', 'admin', 'developer'].includes(claims.role)
  let redirect = isAgent ? helpdeskAgentPath(map) : helpdeskPortalPath(map)

  if (FRAPPE_HANDOFF_URL) {
    try {
      const upstream = await fetch(FRAPPE_HANDOFF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      forwardUpstreamCookies(upstream, c)
      const body = (await upstream.json().catch(() => ({}))) as { redirect?: string }
      if (body.redirect) redirect = body.redirect
    } catch (err) {
      console.error('[helpdesk] frappe handoff failed:', err)
    }
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, scope: map, portal: !isAgent })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) => {
  const body = publicSsoHealth({
    service: 'indobase-helpdesk',
    audience: AUDIENCE,
    versionEnvKeys: ['HELPDESK_VERSION', 'GIT_SHA'],
  })
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  return c.json(body)
})

// ── Auth middleware ──────────────────────────────────────────────────────────

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

app.use('/api/*', requireSession)

app.get('/api/me', (c) => {
  const s = c.get('session')
  const map = scopeFromSession(s)
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    isAgent: s.isAgent,
    canEdit: s.canEdit,
    studioUrl: s.studioUrl,
    scope: map,
    agentPath: helpdeskAgentPath(map),
    portalPath: helpdeskPortalPath(map),
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-helpdesk' }))

// ── Helpdesk upstream proxy (production path) ─────────────────────────────────

async function proxyHelpdesk(c: Context, portal = false) {
  if (!HELPDESK_UPSTREAM) return c.notFound()
  const url = new URL(c.req.url)
  const upstreamPath = upstreamHelpdeskPath(url.pathname, portal)
  const target = `${HELPDESK_UPSTREAM}${upstreamPath}${url.search}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  const res = await fetch(target, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
    redirect: 'manual',
  })
  // Copy headers — undici Response headers are immutable; securityHeaders must .set().
  return new Response(res.body, { status: res.status, headers: new Headers(res.headers) })
}

app.all('/h/*', (c) => proxyHelpdesk(c, false))
app.all('/portal/*', (c) => proxyHelpdesk(c, true))
app.all('/helpdesk', (c) => proxyHelpdesk(c, false))
app.all('/helpdesk/*', (c) => proxyHelpdesk(c, false))
app.all('/assets/*', (c) => proxyHelpdesk(c, false))
/** Frappe native login is disabled — Studio SSO is the only sign-in surface. */
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))

// ── Dev shell (no Helpdesk upstream) ───────────────────────────────────────────

function renderShell(session: Session): string {
  const map = scopeFromSession(session)
  const path = redirectForSession(session)
  const portalNote = session.isAgent
    ? 'Agent desk — tickets, SLAs, assignment rules, and knowledge base.'
    : 'Customer portal — submit and track tickets for this project.'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Helpdesk</title>
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
    .features { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 16px; }
    .feat { padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
    .feat strong { display: block; margin-bottom: 4px; }
  </style>
</head>
<body>
  <header><strong>Indobase Helpdesk</strong><span class="pill">${session.isAgent ? 'Agent' : 'Portal'}</span></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${map.queueTitle}</h1>
      <p class="meta">${map.teamTitle} · signed in as ${session.email}</p>
      <p class="meta">${portalNote}</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0" />
      <dl>
        <dt>Organization</dt><dd><code>${map.orgSlug}</code> → team <code>${map.teamKey}</code></dd>
        <dt>Project</dt><dd><code>${map.projectRef}</code> → queue <code>${map.queueKey}</code></dd>
        <dt>Deep link</dt><dd><code>${path}</code></dd>
        <dt>Role</dt><dd>${session.role}${session.isAgent ? ' (agent desk)' : ' (customer portal)'}</dd>
      </dl>
      <div class="features">
        <div class="feat"><strong>Tickets</strong>Track issues from customers and team</div>
        <div class="feat"><strong>SLAs</strong>Response and resolution targets</div>
        <div class="feat"><strong>Knowledge base</strong>Self-serve articles for customers</div>
        <div class="feat"><strong>Assignment</strong>Route tickets to the right agents</div>
      </div>
      <p class="meta" style="margin-top:20px">
        Dev shell — production serves the full Helpdesk experience.
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
  if (HELPDESK_UPSTREAM) {
    return c.redirect(redirectForSession(session))
  }
  return c.html(renderShell(session))
})

app.get('/h/:team/:queue', (c) => {
  if (HELPDESK_UPSTREAM) return proxyHelpdesk(c, false)
  return renderAuthenticatedShell(c)
})

app.get('/portal/:team/:queue', (c) => {
  if (HELPDESK_UPSTREAM) return proxyHelpdesk(c, true)
  return renderAuthenticatedShell(c)
})

function renderAuthenticatedShell(c: Context) {
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

// ── Boot ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT || 8095)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-helpdesk] listening on :${port}`)
})

export default app
