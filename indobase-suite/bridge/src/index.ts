/**
 * Indobase Workspace — SSO bridge and optional Frappe Suite proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. When `SUITE_UPSTREAM` is set, authenticated
 * `/s/*` requests proxy to the Frappe Suite frontend; otherwise a lightweight dev shell renders.
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
import { isSuiteModuleId, listModulesForApi, modulePath, SUITE_UPSTREAM_PREFIXES, upstreamSuitePath } from './modules.js'
import { buildWorkspaceMap, workspaceHomePath } from './workspace-map.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const SUITE_UPSTREAM = (process.env.SUITE_UPSTREAM || '').replace(/\/+$/, '')
const FRAPPE_HANDOFF_URL = (process.env.FRAPPE_STUDIO_HANDOFF_URL || '').replace(/\/+$/, '')
const EMAIL_PUBLIC_URL = (process.env.INDOBASE_EMAIL_URL || 'https://email.indobase.in').replace(
  /\/+$/,
  ''
)
const DESIGN_PUBLIC_URL = (
  process.env.INDOBASE_DESIGN_URL || 'https://design.indobase.in'
).replace(/\/+$/, '')

function workspaceMapFromSession(session: Session) {
  return buildWorkspaceMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
}

function suiteLaunchPath(pathname: string): string {
  if (!SUITE_UPSTREAM) return pathname
  return upstreamSuitePath(pathname)
}

function resolveRedirectFromQuery(search: string, session: Session): string {
  const params = new URLSearchParams(search)
  const moduleParam = params.get('module')
  const map = workspaceMapFromSession(session)

  if (moduleParam && isSuiteModuleId(moduleParam)) {
    if (moduleParam === 'mail') {
      return `${STUDIO_URL}/project/${encodeURIComponent(session.projectRef)}/workspace?open=mail`
    }
    return suiteLaunchPath(modulePath(map, moduleParam))
  }

  return suiteLaunchPath(workspaceHomePath(map))
}

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase Workspace…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase Workspace…</p>
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
    console.error('[workspace] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  const map = buildWorkspaceMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })

  let redirect = resolveRedirectFromQuery(c.req.url.split('?')[1] || '', {
    gotrueId: claims.sub,
    email: claims.email,
    projectRef: claims.project_ref,
    orgSlug: claims.organization_slug,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
    role: claims.role,
    canEdit: claims.role !== 'viewer',
    studioUrl: claims.studio_url || STUDIO_URL,
  })

  if (FRAPPE_HANDOFF_URL) {
    try {
      const upstream = await fetch(FRAPPE_HANDOFF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const setCookie = upstream.headers.get('set-cookie')
      if (setCookie) c.header('Set-Cookie', setCookie)
      const body = (await upstream.json().catch(() => ({}))) as { redirect?: string }
      if (body.redirect) redirect = body.redirect
    } catch (err) {
      console.error('[workspace] frappe handoff failed:', err)
    }
  }

  c.header('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, workspace: map })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) =>
  c.json({
    ok: true,
    service: 'indobase-workspace',
    audience: AUDIENCE,
    version: process.env.SUITE_VERSION || process.env.GIT_SHA || 'dev',
    studioUrl: STUDIO_URL,
    suiteUpstream: SUITE_UPSTREAM || null,
    handoffConfigured: (() => {
      try {
        resolveHandoffSecret()
        return true
      } catch {
        return false
      }
    })(),
    modules: listModulesForApi(),
  })
)

// ── Suite upstream proxy (production path) ─────────────────────────────────────

async function proxySuite(c: Context) {
  if (!SUITE_UPSTREAM) return c.notFound()
  const url = new URL(c.req.url)
  const upstreamPath = upstreamSuitePath(url.pathname)
  const target = `${SUITE_UPSTREAM}${upstreamPath}${url.search}`
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

function redirectSuiteDeepLink(c: Context) {
  const upstream = upstreamSuitePath(new URL(c.req.url).pathname)
  return c.redirect(upstream, 302)
}

/** Frappe API + SPA routes — registered before bridge `/api/me` auth. */
if (SUITE_UPSTREAM) {
  app.all('/api/method/*', proxySuite)
  app.all('/api/resource/*', proxySuite)
  app.all('/assets/*', proxySuite)
  app.all('/files/*', proxySuite)
  app.all('/private/*', proxySuite)
  app.all('/socket.io/*', proxySuite)
  for (const prefix of SUITE_UPSTREAM_PREFIXES) {
    app.all(prefix, proxySuite)
    app.all(`${prefix}/*`, proxySuite)
  }
}

// ── Auth middleware (bridge API only) ────────────────────────────────────────

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
  const map = workspaceMapFromSession(s)
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    canEdit: s.canEdit,
    studioUrl: s.studioUrl,
    workspace: map,
    homePath: workspaceHomePath(map),
    modules: listModulesForApi().map((m) => ({
      ...m,
      path: modulePath(map, m.id),
    })),
    external: {
      email: EMAIL_PUBLIC_URL,
      design: DESIGN_PUBLIC_URL,
    },
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-workspace' }))

/** Indobase-branded deep links → flat Suite SPA routes (Vue router expects `/drive`, not `/s/...`). */
app.all('/s/*', (c) => (SUITE_UPSTREAM ? redirectSuiteDeepLink(c) : proxySuite(c)))

/** Frappe native login is disabled — Studio SSO is the only sign-in surface. */
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))

// ── Dev shell (no Suite upstream) ─────────────────────────────────────────────

function renderShell(session: Session, activeModule?: string): string {
  const map = workspaceMapFromSession(session)
  const home = workspaceHomePath(map)
  const modules = listModulesForApi()

  const tiles = modules
    .map((m) => {
      const path = modulePath(map, m.id)
      const isExternal = m.externalProduct === 'email'
      const href = isExternal
        ? `${STUDIO_URL}/project/${encodeURIComponent(session.projectRef)}/workspace?open=mail`
        : path
      const active = activeModule === m.id ? ' border-[#3B8FD6] bg-[#eff6ff]' : ''
      return `<a href="${href}" class="tile${active}">
        <strong>${m.label}</strong>
        <span>${m.description}</span>
      </a>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Workspace</title>
  <style>
    :root { --brand: #3B8FD6; --ink: #0f172a; --muted: #64748b; --surface: #fff; --border: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; color: var(--ink); }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
    header strong { color: var(--brand); }
    main { max-width: 1080px; margin: 32px auto; padding: 0 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .meta { color: var(--muted); font-size: 14px; margin-top: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 20px; }
    .tile { display: flex; flex-direction: column; gap: 6px; padding: 16px; border: 1px solid var(--border); border-radius: 10px; text-decoration: none; color: inherit; transition: box-shadow .15s; }
    .tile:hover { box-shadow: 0 4px 12px rgba(15,23,42,.08); }
    .tile strong { font-size: 15px; }
    .tile span { font-size: 13px; color: var(--muted); line-height: 1.35; }
    .pill { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    code { background: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <header><strong>Indobase Workspace</strong><span class="pill">${map.projectTitle}</span></header>
  <main>
    <div class="card">
      <h1 style="margin:0 0 8px;font-size:22px">${map.projectTitle}</h1>
      <p class="meta">${map.teamTitle} · signed in as ${session.email}</p>
      <p class="meta">Home: <code>${home}</code></p>
      <div class="grid">${tiles}</div>
      <p class="meta" style="margin-top:20px">
        Dev shell — production serves the full Workspace experience.
        Mail opens Email; Presentations can also open Design from Studio.
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
  if (SUITE_UPSTREAM) {
    return c.redirect('/suite')
  }
  return c.html(renderShell(session))
})

app.get('/s/:team/:project', (c) => {
  if (SUITE_UPSTREAM) return redirectSuiteDeepLink(c)
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

app.get('/s/:team/:project/:module', (c) => {
  if (SUITE_UPSTREAM) return redirectSuiteDeepLink(c)
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  const raw = readCookie(c.req.header('cookie'))
  const session = raw ? readSessionToken(raw, secret) : null
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const mod = c.req.param('module')
  if (mod === 'mail') {
    return c.redirect(
      `${STUDIO_URL}/project/${encodeURIComponent(session.projectRef)}/workspace?open=mail`
    )
  }
  return c.html(renderShell(session, mod))
})

// ── Boot ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT || 8093)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-workspace] listening on :${port}`)
})

export default app
