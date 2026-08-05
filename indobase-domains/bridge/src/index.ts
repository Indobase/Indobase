/**
 * Indobase Domains — SSO bridge + Studio domains API proxy + console SPA.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'

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
import { proxyStudioDomainsApi } from './studio-proxy.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'
import { renderDomainsWelcomeHtml } from './welcome.js'
import { bridgeSentryOnError, initBridgeSentry } from './sentry.js'

initBridgeSentry('domains-bridge')

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)
app.onError(bridgeSentryOnError('domains-bridge'))

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const bridgeDir = dirname(fileURLToPath(import.meta.url))
const consoleDistCandidates = [
  join(bridgeDir, '..', 'console-dist'),
  join(bridgeDir, '..', 'console', 'dist'),
]
const consoleDist =
  consoleDistCandidates.find((path) => existsSync(join(path, 'index.html'))) ?? consoleDistCandidates[0]

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase Domains…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase Domains…</p>
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
  location.replace('/');
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
    console.error('[domains] handoff secret misconfigured:', err)
    return c.json({ error: 'sso not configured' }, 503)
  }

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) return c.json({ error: 'invalid or expired token' }, 401)

  c.header('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) => {
  const body = publicSsoHealth({
    service: 'indobase-domains',
    audience: AUDIENCE,
    versionEnvKeys: ['DOMAINS_VERSION', 'GIT_SHA'],
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
  if (!session) {
    return c.json({ error: 'unauthorized', signInUrl: `${STUDIO_URL}/sign-in` }, 401)
  }
  c.set('session', session)
  await next()
}

app.use('/api/*', requireSession)

app.get('/api/me', (c) => {
  const s = c.get('session')
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    projectName: s.projectName,
    organizationName: s.organizationName,
    role: s.role,
    studioUrl: s.studioUrl,
    attachCustomDomainsUrl: `${s.studioUrl}/project/${s.projectRef}/settings/general#custom-domains`,
  })
})

async function forwardDomains(c: Context<{ Variables: Vars }>, path: string, init?: RequestInit) {
  const session = c.get('session')
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 'sso not configured' }, 503)
  }

  const upstream = await proxyStudioDomainsApi(session, secret, path, init)
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
  })
}

app.post('/api/search', async (c) =>
  forwardDomains(c, '/search', { method: 'POST', body: await c.req.text() })
)

app.post('/api/purchase-intent', async (c) =>
  forwardDomains(c, '/purchase-intent', { method: 'POST', body: await c.req.text() })
)

app.post('/api/confirm', async (c) =>
  forwardDomains(c, '/confirm', { method: 'POST', body: await c.req.text() })
)

app.get('/api/registrations', (c) => forwardDomains(c, '/', { method: 'GET' }))

app.get('/api/pricing', (c) => {
  const tld = c.req.query('tld') || 'com'
  return forwardDomains(c, `/pricing?tld=${encodeURIComponent(tld)}`, { method: 'GET' })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-domains' }))

function renderWelcomePage(c: Context) {
  return c.html(
    renderDomainsWelcomeHtml({
      studioUrl: STUDIO_URL,
      projectRef: c.req.query('project_ref'),
    })
  )
}

app.get('/welcome', renderWelcomePage)

function sessionOrNull(c: Context): Session | null {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return null
  }
  const raw = readCookie(c.req.header('cookie'))
  return raw ? readSessionToken(raw, secret) : null
}

function unauthenticatedWelcomeRedirect(c: Context) {
  const projectRef = c.req.query('project_ref')
  return c.redirect(projectRef ? `/welcome?project_ref=${encodeURIComponent(projectRef)}` : '/welcome')
}

// ── Console SPA ──────────────────────────────────────────────────────────────

if (existsSync(consoleDist)) {
  app.use('/assets/*', serveStatic({ root: consoleDist }))

  app.get('/', async (c) => {
    const session = sessionOrNull(c)
    if (!session) return unauthenticatedWelcomeRedirect(c)
    const indexPath = join(consoleDist, 'index.html')
    return c.html(readFileSync(indexPath, 'utf8'))
  })
} else {
  app.get('/', (c) => {
    const session = sessionOrNull(c)
    if (!session) return unauthenticatedWelcomeRedirect(c)
    return c.html(
      `<!doctype html><title>Indobase Domains</title><p>Console build missing — run <code>npm run build</code> in console/</p>`
    )
  })
}

const port = Number(process.env.PORT || 8094)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-domains] listening on :${port}`)
})

export default app
