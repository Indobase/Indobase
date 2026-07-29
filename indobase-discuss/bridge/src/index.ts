/**
 * Indobase Discuss — SSO bridge and optional Gameplan proxy.
 *
 * Studio hands off to `/sso/launch#token=…`. When `GAMEPLAN_UPSTREAM` is set, authenticated
 * `/g/*` requests proxy to the Frappe Gameplan frontend; otherwise a lightweight dev shell renders.
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
import { buildDiscussSpaceMap, gameplanSpacePath } from './space-map.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const GAMEPLAN_UPSTREAM = (process.env.GAMEPLAN_UPSTREAM || '').replace(/\/+$/, '')
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
    c.res.headers.append('Set-Cookie', cookie)
  }
}

function frappeHandoffRedirect(body: {
  redirect?: string
  message?: { redirect?: string }
}): string | undefined {
  return body.redirect ?? body.message?.redirect
}

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
    console.error('[discuss] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  if (FRAPPE_HANDOFF_URL) {
    try {
      const upstream = await fetch(FRAPPE_HANDOFF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      forwardUpstreamCookies(upstream, c)
      const body = (await upstream.json().catch(() => ({}))) as { redirect?: string }
      c.header('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
      const map = buildDiscussSpaceMap({
        orgSlug: claims.organization_slug,
        projectRef: claims.project_ref,
        projectName: claims.project_name,
        organizationName: claims.organization_name,
      })
      return c.json({ ok: true, redirect: frappeHandoffRedirect(body) || gameplanSpacePath(map) })
    } catch (err) {
      console.error('[discuss] frappe handoff failed:', err)
    }
  }

  c.header('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  const map = buildDiscussSpaceMap({
    orgSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    projectName: claims.project_name,
    organizationName: claims.organization_name,
  })
  return c.json({ ok: true, redirect: gameplanSpacePath(map) })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) =>
  c.json({
    ok: true,
    service: 'indobase-discuss',
    audience: AUDIENCE,
    version: process.env.DISCUSS_VERSION || process.env.GIT_SHA || 'dev',
    studioUrl: STUDIO_URL,
    gameplanUpstream: GAMEPLAN_UPSTREAM || null,
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

// ── Gameplan proxy (production path) ─────────────────────────────────────────

async function proxyGameplan(c: Context) {
  if (!GAMEPLAN_UPSTREAM) return c.notFound()
  const url = new URL(c.req.url)
  const target = `${GAMEPLAN_UPSTREAM}${url.pathname}${url.search}`
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

app.all('/g/*', proxyGameplan)
app.all('/assets/*', proxyGameplan)
/** Frappe native login is disabled — Studio SSO is the only sign-in surface. */
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))

// ── Dev shell (no Gameplan upstream) ─────────────────────────────────────────

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
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  const raw = readCookie(c.req.header('cookie'))
  const session = raw ? readSessionToken(raw, secret) : null
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
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

// ── Boot ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT || 8092)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-discuss] listening on :${port}`)
})

export default app
