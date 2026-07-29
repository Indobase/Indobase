/**
 * Indobase CRM — SSO bridge and optional Frappe CRM proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. When `CRM_UPSTREAM` is set, authenticated
 * `/c/*` and `/crm/*` requests proxy to the Frappe CRM frontend; otherwise a dev shell renders.
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
import { buildCrmScopeMap, crmPipelinePath, upstreamCrmPath } from './crm-map.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const CRM_UPSTREAM = (process.env.CRM_UPSTREAM || '').replace(/\/+$/, '')
const FRAPPE_HANDOFF_URL = (process.env.FRAPPE_STUDIO_HANDOFF_URL || '').replace(/\/+$/, '')

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
    c.header('Set-Cookie', cookie, { append: true })
  }
}

function scopeFromSession(session: Session) {
  return buildCrmScopeMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
}

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase CRM…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase CRM…</p>
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
  if (!r.ok) { location.replace(${JSON.stringify(STUDIO_URL)} + '/sign-in'); return; }
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
    console.error('[crm] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildCrmScopeMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })

  let redirect = crmPipelinePath(map)

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
      console.error('[crm] frappe handoff failed:', err)
    }
  }

  c.header('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, scope: map })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) =>
  c.json({
    ok: true,
    service: 'indobase-crm',
    audience: AUDIENCE,
    version: process.env.CRM_VERSION || process.env.GIT_SHA || 'dev',
    studioUrl: STUDIO_URL,
    crmUpstream: CRM_UPSTREAM || null,
    handoffConfigured: (() => {
      try {
        resolveHandoffSecret()
        return true
      } catch {
        return false
      }
    })(),
  })
)

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
    canEdit: s.canEdit,
    studioUrl: s.studioUrl,
    scope: map,
    pipelinePath: crmPipelinePath(map),
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-crm' }))

// ── CRM upstream proxy (production path) ─────────────────────────────────────

async function proxyCrm(c: Context) {
  if (!CRM_UPSTREAM) return c.notFound()
  const url = new URL(c.req.url)
  const upstreamPath = upstreamCrmPath(url.pathname)
  const target = `${CRM_UPSTREAM}${upstreamPath}${url.search}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  const res = await fetch(target, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
    redirect: 'manual',
  })
  return new Response(res.body, { status: res.status, headers: res.headers })
}

app.all('/c/*', proxyCrm)
app.all('/crm/*', proxyCrm)
app.all('/assets/*', proxyCrm)
<<<<<<< HEAD
=======
/** Frappe native login is disabled — Studio SSO is the only sign-in surface. */
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
>>>>>>> 25af6fd3 (feat(ecosystem): CRM, Domains, and Helpdesk with Studio launch and Builder preview hardening)

// ── Dev shell (no CRM upstream) ────────────────────────────────────────────────

function renderShell(session: Session): string {
  const map = scopeFromSession(session)
  const path = crmPipelinePath(map)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase CRM</title>
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
  <header><strong>Indobase CRM</strong><span class="pill">Sales</span></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${map.pipelineTitle}</h1>
      <p class="meta">${map.teamTitle} · signed in as ${session.email}</p>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0" />
      <dl>
        <dt>Organization</dt><dd><code>${map.orgSlug}</code> → team <code>${map.teamKey}</code></dd>
        <dt>Project</dt><dd><code>${map.projectRef}</code> → pipeline <code>${map.pipelineKey}</code></dd>
        <dt>Deep link</dt><dd><code>${path}</code></dd>
        <dt>Role</dt><dd>${session.role}${session.canEdit ? '' : ' (view only)'}</dd>
      </dl>
      <div class="features">
        <div class="feat"><strong>Leads</strong>Capture and qualify inbound interest</div>
        <div class="feat"><strong>Deals</strong>Track pipeline stages and revenue</div>
        <div class="feat"><strong>Kanban</strong>Drag-and-drop deal boards</div>
        <div class="feat"><strong>Views</strong>Custom filters and saved layouts</div>
      </div>
      <p class="meta" style="margin-top:20px">
        Dev shell — production serves the full CRM experience.
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
  if (CRM_UPSTREAM) {
    const map = scopeFromSession(session)
    return c.redirect(crmPipelinePath(map))
  }
  return c.html(renderShell(session))
})

app.get('/c/:team/:pipeline', (c) => {
  if (CRM_UPSTREAM) return proxyCrm(c)
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
})

// ── Boot ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT || 8094)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-crm] listening on :${port}`)
})

export default app
