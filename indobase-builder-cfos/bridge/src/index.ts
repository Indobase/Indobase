/**
 * Indobase Builder Gen 3 PoC — Studio SSO bridge + agent execution runtime proxy.
 *
 * Studio → `/sso/launch#token=…` → session → workspace chrome embeds `/os/app/*`
 * (reverse-proxied CF OS execution substrate). Optional `/api/indobase/proxy/*` hits the linked project.
 *
 * Session → Generation Context mapping uses `@indobase/cloudflare-adapter` (see docs/BUILDER-GEN3.md).
 */
import { Hono } from 'hono'
import type { Context, Next } from 'hono'

import {
  AUDIENCE,
  claimsToSession,
  clearSessionCookie,
  createSessionToken,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  SESSION_COOKIE,
  sessionCookie,
  verifyStudioHandoff,
  type Session,
} from './auth.js'
import { buildAgentSessionContext } from './indobase-adapter.js'
import { proxyIndobaseApi } from './indobase-proxy.js'
import { proxyCloudflareOs, resolveCloudflareOsBase } from './os-proxy.js'
import { createRuntimeProxyServer } from './runtime-proxy-server.js'
import { renderLandingHtml, renderWorkspaceHtml } from './workspace-html.js'

/** Bridge-owned `/api/*` paths — everything else under `/api` is the agent runtime. */
function isBridgeOwnedApiPath(pathname: string): boolean {
  if (pathname === '/api/session') return true
  if (pathname === '/api/indobase' || pathname.startsWith('/api/indobase/')) return true
  return false
}

const PORT = Number(process.env.PORT || process.env.BUILDER_CFOS_PORT || 8791)
const OS_PREFIX = '/os/app'

function publicVersion(): string {
  for (const key of ['GIT_SHA', 'BUILDER_CFOS_VERSION']) {
    const v = process.env[key]?.trim()
    if (v && v !== 'dev') return v
  }
  return 'dev'
}

async function securityHeaders(c: Context, next: Next) {
  await next()
  const path = new URL(c.req.url).pathname
  // Proxied CF OS sets its own CSP (rewritten for frame-ancestors self).
  if (path.startsWith(OS_PREFIX)) return
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function getSession(c: Context): Session | null {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return null
  }
  const raw = readCookie(c.req.header('cookie'), SESSION_COOKIE)
  if (!raw) return null
  return readSessionToken(raw, secret)
}

function requireSession(c: Context): Session | Response {
  const session = getSession(c)
  if (!session) {
    return c.json({ message: 'Unauthorized — open Builder from Studio' }, 401)
  }
  return session
}

const app = new Hono()
app.use('*', securityHeaders)

app.get('/sso/health', async (c) => {
  let handoffConfigured = false
  try {
    resolveHandoffSecret()
    handoffConfigured = true
  } catch {
    handoffConfigured = false
  }

  const upstream = resolveCloudflareOsBase()
  let cloudflareOsReachable: boolean | null = null
  if (upstream) {
    try {
      const res = await fetch(upstream, { method: 'GET', redirect: 'manual' })
      cloudflareOsReachable = res.status < 500
    } catch {
      cloudflareOsReachable = false
    }
  }

  return c.json({
    ok: true,
    service: 'indobase-builder-cfos',
    audience: AUDIENCE,
    version: publicVersion(),
    handoffConfigured,
    agentRuntimeConfigured: Boolean(upstream),
    agentRuntimeReachable: cloudflareOsReachable,
    /** @deprecated internal — prefer agentRuntimeConfigured */
    cloudflareOsConfigured: Boolean(upstream),
    cloudflareOsReachable,
    osProxyPath: `${OS_PREFIX}/`,
    indobaseProxyPath: '/api/indobase/proxy/',
    gen3Adapter: '@indobase/cloudflare-adapter',
  })
})

app.get('/sso/launch', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening Indobase Builder…</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e8eef8;
      display:grid; place-items:center; min-height:100vh; margin:0; }
    p { opacity:.85; }
  </style>
</head>
<body>
  <p id="status">Signing you into Builder…</p>
  <script>
    (async () => {
      const status = document.getElementById('status');
      const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const token = hash.get('token');
      const qs = new URLSearchParams(location.search);
      const next = qs.get('next') || '/';
      if (!token) {
        status.textContent = 'Missing handoff token. Open Builder from Studio.';
        return;
      }
      try {
        const res = await fetch('/sso/exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'same-origin',
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          status.textContent = body.message || ('SSO failed (' + res.status + ')');
          return;
        }
        history.replaceState(null, '', location.pathname + location.search);
        location.replace(next.startsWith('/') ? next : '/');
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'SSO failed';
      }
    })();
  </script>
</body>
</html>`)
})

app.post('/sso/exchange', async (c) => {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return c.json(
      { message: err instanceof Error ? err.message : 'Handoff secret not configured' },
      503
    )
  }

  const body = await c.req.json().catch(() => null)
  const token = body && typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return c.json({ message: 'token required' }, 400)

  const claims = verifyStudioHandoff(token, secret)
  if (!claims) {
    return c.json(
      {
        message:
          'Invalid or expired Studio handoff token (check BUILDER_CFOS_HANDOFF_SECRET matches Studio)',
      },
      401
    )
  }

  const session = claimsToSession(claims)
  const sessionToken = createSessionToken(session, secret)
  c.header('Set-Cookie', sessionCookie(sessionToken))
  return c.json({
    ok: true,
    project_ref: session.projectRef,
    email: session.email,
  })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/api/session', (c) => {
  const session = getSession(c)
  if (!session) return c.json({ message: 'Unauthorized' }, 401)
  const upstream = resolveCloudflareOsBase()
  const agent = buildAgentSessionContext(session)
  return c.json({
    email: session.email,
    project_ref: session.projectRef,
    project_name: session.projectName,
    organization_slug: session.orgSlug,
    studio_url: session.studioUrl,
    backend: session.backend
      ? {
          api_url: session.backend.api_url,
          auth_url: session.backend.auth_url,
          rest_url: session.backend.rest_url,
          storage_url: session.backend.storage_url,
          project_ref: session.backend.project_ref,
          project_name: session.backend.project_name,
          anon_key: session.backend.anon_key,
        }
      : null,
    // Gen 3: Indobase naming for clients; upstream URL is internal execution substrate only.
    agent_runtime_configured: Boolean(upstream),
    agent_runtime_url: upstream || null,
    /** @deprecated internal — prefer agent_runtime_url */
    cloudflare_os_url: upstream || null,
    os_proxy_path: `${OS_PREFIX}/`,
    indobase_proxy_path: '/api/indobase/proxy/',
    generation_context: agent.generation,
    agent_hint: agent.agentHint,
  })
})

app.all('/api/indobase/proxy/*', async (c) => {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return proxyIndobaseApi(c, sessionOrErr, { stripPrefix: '/api/indobase/proxy' })
})

async function requireRuntimeProxy(c: Context, stripPrefix: string) {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const upstream = resolveCloudflareOsBase()
  if (!upstream) {
    return c.json(
      {
        message: 'CLOUDFLARE_OS_URL is not set. Run scripts/dev-stack.sh or export the URL.',
      },
      503
    )
  }
  return proxyCloudflareOs(c, { upstreamBase: upstream, stripPrefix })
}

// Root-absolute CF OS static assets (Vite build emits `/assets/...`).
app.all('/assets/*', (c) => requireRuntimeProxy(c, ''))

// Other CF OS HTTP APIs (`/api/client-errors`, `/api/site-logo`, …).
// Exact `/api` WebSocket is handled by createRuntimeProxyServer upgrade hook.
app.all('/api/*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  if (isBridgeOwnedApiPath(pathname)) return c.notFound()
  return requireRuntimeProxy(c, '')
})

app.all(`${OS_PREFIX}/*`, (c) => requireRuntimeProxy(c, OS_PREFIX))

app.get(`${OS_PREFIX}`, (c) => c.redirect(`${OS_PREFIX}/`))

app.get('/', (c) => {
  const session = getSession(c)
  if (!session) return c.html(renderLandingHtml())
  const upstream = resolveCloudflareOsBase()
  return c.html(
    renderWorkspaceHtml({
      session,
      cloudflareOsConfigured: Boolean(upstream),
      osProxyPath: `${OS_PREFIX}/`,
      agentRuntimeUrl: upstream || null,
    })
  )
})

app.get('/workspace', (c) => {
  const session = getSession(c)
  if (!session) return c.redirect('/')
  const upstream = resolveCloudflareOsBase()
  return c.html(
    renderWorkspaceHtml({
      session,
      cloudflareOsConfigured: Boolean(upstream),
      osProxyPath: `${OS_PREFIX}/`,
      agentRuntimeUrl: upstream || null,
    })
  )
})

const upstream = resolveCloudflareOsBase()
console.log(
  `[builder-cfos] listening on :${PORT} aud=${AUDIENCE} cfos=${upstream || '(unset)'} proxy=${OS_PREFIX}/`
)

createRuntimeProxyServer(app, PORT)
