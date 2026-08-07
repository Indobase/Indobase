/**
 * Indobase OS (Agentic Business OS) — Gen 3 bridge.
 *
 * Day-one entry: `/` (+ `/workspace`) mints a guest/signed-in session cookie, then
 * proxies the CFOS agent desktop as the top document (no outer header / iframe shell).
 * Optional `/api/indobase/proxy/*` hits the linked project.
 *
 * Session → Generation Context via `@indobase/cloudflare-adapter` (docs/BUILDER-GEN3.md).
 */
import { Hono } from 'hono'
import type { Context, Next } from 'hono'

import {
  AUDIENCE,
  claimsToSession,
  clearSessionCookie,
  createGuestSession,
  createSessionToken,
  isGuestSession,
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
import {
  platformDeployPublish,
  platformOtpStart,
  platformOtpVerify,
  platformRuntimeEnsure,
  resolvePlatformApiUrl,
} from './platform-api-client.js'
import {
  launchStaticBusiness,
  readLiveFile,
  resolveWorkspaceRefForHost,
  getLaunchStatus,
  sanitizeSubdomain,
} from './static-launch.js'
import {
  executeLaunchBusinessTool,
  launchBusinessToolCatalog,
  LAUNCH_AGENT_HARD_RULES,
} from './launch-business-tool.js'
import { GUEST_ACCOUNT_FIRST_HINT } from '@indobase/cloudflare-adapter'
import { renderLandingHtml, renderOfflineDesktopHtml, injectIndobaseContextBootstrap } from './workspace-html.js'

/** Bridge-owned `/api/*` paths — everything else under `/api` is the agent runtime. */
function isBridgeOwnedApiPath(pathname: string): boolean {
  if (pathname === '/api/session') return true
  if (pathname === '/api/indobase' || pathname.startsWith('/api/indobase/')) return true
  if (pathname === '/api/os' || pathname.startsWith('/api/os/')) return true
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
  // Proxied CF OS under /os/app sets its own CSP (frame-ancestors self).
  // Top-document `/` is the OS itself — apply standard bridge security headers.
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
    return c.json({ message: 'Unauthorized — open Indobase OS and continue in chat' }, 401)
  }
  return session
}

/** Multi-tenant SaaS: Launch / Enable require a real account (not Guest / draft_*). */
function requireSignedInSession(c: Context): Session | Response {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  if (isGuestSession(sessionOrErr)) {
    return c.json(
      {
        ok: false,
        code: 'account_required',
        message:
          'Create your Indobase account in chat first (name + email + verification code), then Launch or Enable.',
      },
      403,
    )
  }
  return sessionOrErr
}

/** Mint a guest workspace session so `/` opens the agent desktop immediately (account in chat). */
function ensureSessionForWorkspace(c: Context): { session: Session | null; setCookie?: string } {
  const existing = getSession(c)
  if (existing) return { session: existing }
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return { session: null }
  }
  const guest = createGuestSession()
  const setCookie = sessionCookie(createSessionToken(guest, secret))
  return { session: guest, setCookie }
}

function withOptionalSetCookie(res: Response, setCookie?: string): Response {
  if (!setCookie) return res
  const headers = new Headers(res.headers)
  headers.append('Set-Cookie', setCookie)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

/** Proxy CFOS index HTML as the top document; inject same-origin session bootstrap. */
async function serveAgentDesktop(c: Context): Promise<Response> {
  const { session, setCookie } = ensureSessionForWorkspace(c)
  if (!session) {
    return c.html(renderLandingHtml())
  }
  const upstream = resolveCloudflareOsBase()
  if (!upstream) {
    if (setCookie) c.header('Set-Cookie', setCookie)
    return c.html(renderOfflineDesktopHtml(session))
  }

  const proxied = await proxyCloudflareOs(c, {
    upstreamBase: upstream,
    stripPrefix: '',
    overridePath: '/',
  })

  const contentType = proxied.headers.get('content-type') || ''
  if (contentType.includes('text/html') && c.req.method === 'GET') {
    const html = injectIndobaseContextBootstrap(await proxied.text())
    const headers = new Headers(proxied.headers)
    if (setCookie) headers.append('Set-Cookie', setCookie)
    return new Response(html, {
      status: proxied.status,
      statusText: proxied.statusText,
      headers,
    })
  }

  return withOptionalSetCookie(proxied, setCookie)
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

  let platformApiConfigured = false
  try {
    platformApiConfigured = Boolean(resolvePlatformApiUrl())
  } catch {
    platformApiConfigured = false
  }

  const ready =
    handoffConfigured && Boolean(upstream) && cloudflareOsReachable === true && platformApiConfigured

  return c.json({
    ok: true,
    ready,
    service: 'indobase-builder-cfos',
    audience: AUDIENCE,
    version: publicVersion(),
    handoffConfigured,
    platformApiConfigured,
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

app.get('/ready', async (c) => {
  let handoffConfigured = false
  try {
    resolveHandoffSecret()
    handoffConfigured = true
  } catch {
    handoffConfigured = false
  }
  const upstream = resolveCloudflareOsBase()
  let runtimeOk = false
  if (upstream) {
    try {
      const res = await fetch(upstream, { method: 'GET', redirect: 'manual' })
      runtimeOk = res.status < 500
    } catch {
      runtimeOk = false
    }
  }
  let platformApiConfigured = false
  try {
    platformApiConfigured = Boolean(resolvePlatformApiUrl())
  } catch {
    platformApiConfigured = false
  }
  const ready = handoffConfigured && Boolean(upstream) && runtimeOk && platformApiConfigured
  const body = {
    ok: ready,
    ready,
    handoffConfigured,
    platformApiConfigured,
    agentRuntimeConfigured: Boolean(upstream),
    agentRuntimeReachable: runtimeOk,
    version: publicVersion(),
  }
  return c.json(body, ready ? 200 : 503)
})

app.get('/sso/launch', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening Indobase…</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e8eef8;
      display:grid; place-items:center; min-height:100vh; margin:0; }
    p { opacity:.85; }
  </style>
</head>
<body>
  <p id="status">Opening Indobase OS…</p>
  <script>
    (async () => {
      const status = document.getElementById('status');
      const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const token = hash.get('token');
      const qs = new URLSearchParams(location.search);
      const next = qs.get('next') || '/';
      if (!token) {
        status.textContent = 'Missing handoff token. Use Start building or your Indobase account link.';
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
          'Invalid or expired account handoff token (check BUILDER_CFOS_HANDOFF_SECRET matches the issuer)',
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

/**
 * Start building — send email OTP via Platform API (no data-plane provision).
 */
app.post('/auth/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = body && typeof body.name === 'string' ? body.name.trim() : ''
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const dpdpConsent = Boolean(body && body.dpdpConsent === true)
  if (!name || !email || !email.includes('@')) {
    return c.json({ message: 'name and valid email required' }, 400)
  }
  if (!dpdpConsent) {
    return c.json(
      {
        message:
          'Accept the Privacy Policy and Terms of Service to continue (DPDP consent required).',
      },
      400,
    )
  }

  const result = await platformOtpStart({ name, email, dpdpConsent })
  if (!result.ok) {
    return c.json({ message: result.message }, result.status >= 400 ? result.status : 502)
  }
  return c.json({ ok: true, email: result.email, next: 'chat_verify' })
})

/**
 * Verify OTP — create OS workspace (lazy backend), establish bridge session cookie.
 */
app.post('/auth/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = body && typeof body.name === 'string' ? body.name.trim() : ''
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = body && typeof body.token === 'string' ? body.token.trim() : ''
  if (!name || !email || !email.includes('@') || !token) {
    return c.json({ message: 'name, email, and verification code required' }, 400)
  }

  const result = await platformOtpVerify({ name, email, token })
  if (!result.ok) {
    return c.json({ message: result.message }, result.status >= 400 ? result.status : 502)
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return c.json(
      { message: err instanceof Error ? err.message : 'Handoff secret not configured' },
      503,
    )
  }

  const ws = result.session
  const session: Session = {
    gotrueId: ws.gotrue_id,
    email: ws.email,
    projectRef: ws.workspace_ref,
    orgSlug: ws.organization_slug,
    projectName: ws.workspace_name,
    studioUrl: 'https://studio.indobase.in',
    backend: ws.backend ?? undefined,
  }
  const sessionToken = createSessionToken(session, secret)
  c.header('Set-Cookie', sessionCookie(sessionToken))
  return c.json({
    ok: true,
    project_ref: session.projectRef,
    email: session.email,
    provision_state: ws.provision_state,
    next: '/',
  })
})

/** Lazy Ensurer proxy — capability.ensure via Platform API. */
app.post('/api/os/runtime/ensure', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = await c.req.json().catch(() => ({}))
  const capability =
    body && typeof body.capability === 'string' ? body.capability.trim() : 'auth'
  const result = await platformRuntimeEnsure({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    capability,
  })
  if (result.backend && result.provision_state === 'ready') {
    let secret: string
    try {
      secret = resolveHandoffSecret()
      const updated: Session = { ...sessionOrErr, backend: result.backend }
      c.header('Set-Cookie', sessionCookie(createSessionToken(updated, secret)))
    } catch {
      // session refresh best-effort
    }
  }
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

/** Go Live — Static Launch lane (default). No Studio / provisioner / tenant stack. */
async function handleStaticGoLive(c: Context, session: Session) {
  const body = (await c.req.json().catch(() => ({}))) as {
    reason?: string
    html?: string
    files?: Record<string, string>
    title?: string
    subdomain?: string
    customDomain?: string
    custom_domain?: string
  }
  const customDomain =
    typeof body.customDomain === 'string'
      ? body.customDomain
      : typeof body.custom_domain === 'string'
        ? body.custom_domain
        : undefined
  const result = await launchStaticBusiness({
    workspaceRef: session.projectRef,
    title: body.title || session.projectName || session.projectRef,
    html: typeof body.html === 'string' ? body.html : undefined,
    files: body.files && typeof body.files === 'object' ? body.files : undefined,
    subdomain: typeof body.subdomain === 'string' ? body.subdomain : undefined,
    customDomain,
  })
  return c.json(
    {
      ok: result.ok,
      url: result.url,
      preview_url: result.previewUrl,
      status: result.status,
      message: result.message,
      lane: result.lane,
      subdomain: result.subdomain,
      custom_domain: result.customDomain,
      dns: result.dns,
      artifact_ref: result.artifactRef,
    },
    result.ok ? 200 : 502,
  )
}

/**
 * Go Live / Launch Business — ADR 0005 Static Launch (default).
 * Set LAUNCH_USE_PLATFORM=1 only to force legacy Studio publish path.
 */
app.post('/api/os/deploy/publish', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr

  if (process.env.LAUNCH_USE_PLATFORM === '1') {
    const body = await c.req.json().catch(() => ({}))
    const reason = body && typeof body.reason === 'string' ? body.reason : 'os_launch'
    const result = await platformDeployPublish({
      gotrueId: sessionOrErr.gotrueId,
      email: sessionOrErr.email,
      workspaceRef: sessionOrErr.projectRef,
      reason,
    })
    return c.json(result, result.ok ? 200 : 502)
  }

  return handleStaticGoLive(c, sessionOrErr)
})

/** Alias — customer/agent verb business.launch */
app.post('/api/os/launch', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleStaticGoLive(c, sessionOrErr)
})

/**
 * Agent tool: launchBusiness / goLive — HARD PATH.
 * Requires real html or files; claim_live only when API returns a real URL.
 */
async function handleLaunchBusinessTool(c: Context, session: Session) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await executeLaunchBusinessTool(
    session.projectRef,
    {
      title: typeof body.title === 'string' ? body.title : undefined,
      subdomain: typeof body.subdomain === 'string' ? body.subdomain : undefined,
      customDomain: typeof body.customDomain === 'string' ? body.customDomain : undefined,
      custom_domain: typeof body.custom_domain === 'string' ? body.custom_domain : undefined,
      html: typeof body.html === 'string' ? body.html : undefined,
      files:
        body.files && typeof body.files === 'object' && !Array.isArray(body.files)
          ? (body.files as Record<string, string>)
          : undefined,
    },
    { title: session.projectName || session.projectRef },
  )
  return c.json(result, result.ok ? 200 : result.status === 'rejected' ? 400 : 502)
}

app.post('/api/os/tools/launchBusiness', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleLaunchBusinessTool(c, sessionOrErr)
})

app.post('/api/os/tools/goLive', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleLaunchBusinessTool(c, sessionOrErr)
})

/** Attach a domain the customer already owns (CNAME → Indobase). */
app.post('/api/os/domains/attach', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as { domain?: string; customDomain?: string }
  const domain = typeof body.domain === 'string' ? body.domain : body.customDomain
  if (!domain || typeof domain !== 'string') {
    return c.json({ ok: false, message: 'Provide the domain you already own.' }, 400)
  }
  const status = await getLaunchStatus(sessionOrErr.projectRef)
  const result = await launchStaticBusiness({
    workspaceRef: sessionOrErr.projectRef,
    title: sessionOrErr.projectName || sessionOrErr.projectRef,
    subdomain: status.subdomain || sanitizeSubdomain(sessionOrErr.projectRef),
    customDomain: domain,
  })
  return c.json(
    {
      ok: result.ok,
      url: result.url,
      preview_url: result.previewUrl,
      status: result.status,
      message: result.message,
      subdomain: result.subdomain,
      custom_domain: result.customDomain,
      dns: result.dns,
    },
    result.ok ? 200 : 502,
  )
})

app.get('/api/os/launch/status', async (c) => {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const status = await getLaunchStatus(sessionOrErr.projectRef)
  return c.json({ ok: true, ...status, launch_rules: LAUNCH_AGENT_HARD_RULES })
})

/** Host-based serving: custom domain or *.indobase.in → static site */
app.use('*', async (c, next) => {
  const host = (c.req.header('host') || '').split(':')[0].toLowerCase()
  if (!host || host === '127.0.0.1' || host === 'localhost') {
    return next()
  }
  // Skip API / OS chrome hosts
  if (host.startsWith('builder.') || host.startsWith('studio.') || host.startsWith('api.')) {
    return next()
  }
  const pathName = new URL(c.req.url).pathname
  if (
    pathName.startsWith('/api/') ||
    pathName.startsWith('/os/') ||
    pathName.startsWith('/sso/') ||
    pathName.startsWith('/auth/') ||
    pathName.startsWith('/assets/')
  ) {
    return next()
  }
  const ref = await resolveWorkspaceRefForHost(host)
  if (!ref) return next()
  const rel = pathName === '/' ? 'index.html' : pathName.replace(/^\/+/, '')
  const file = await readLiveFile(ref, rel)
  if (!file) return c.text('Not found', 404)
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'X-Indobase-Launch-Lane': 'static',
      'X-Indobase-Workspace': ref,
    },
  })
})

/** Public static sites from Static Launch lane */
app.get('/live/:ref/*', async (c) => {
  const ref = c.req.param('ref')
  const wildcard = (c.req.param('*') || '').replace(/^\/+/, '')
  const file = await readLiveFile(ref, wildcard || 'index.html')
  if (!file) return c.text('Not found', 404)
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=60',
      'X-Indobase-Launch-Lane': 'static',
    },
  })
})

app.get('/live/:ref', (c) => c.redirect(`/live/${c.req.param('ref')}/`))
app.get('/live/:ref/', async (c) => {
  const file = await readLiveFile(c.req.param('ref'), 'index.html')
  if (!file) return c.text('Not found', 404)
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: { 'Content-Type': file.contentType, 'X-Indobase-Launch-Lane': 'static' },
  })
})

app.get('/api/session', (c) => {
  const session = getSession(c)
  if (!session) return c.json({ message: 'Unauthorized' }, 401)
  const upstream = resolveCloudflareOsBase()
  const agent = buildAgentSessionContext(session)
  const guest = isGuestSession(session)
  // Guest: agent.agentHint already leads with GUEST_ACCOUNT_FIRST_HINT (adapter SoT).
  // Re-assert at the very front of the JSON payload for CFOS bootstrap consumers.
  const agentHintBody = `${agent.agentHint}\n\n${LAUNCH_AGENT_HARD_RULES}`
  const agentHint = guest
    ? agentHintBody.startsWith('GUEST ACCOUNT GATE')
      ? agentHintBody
      : `${GUEST_ACCOUNT_FIRST_HINT}\n\n${agentHintBody}`
    : agentHintBody
  return c.json({
    email: session.email,
    guest,
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
    agent_hint: agentHint,
    onboarding: guest
      ? {
          account_required: true,
          gate: 'first',
          message:
            'Acknowledge their request, then complete Indobase account in chat (name+email+DPDP → /auth/start → OTP → /auth/verify) before any other work.',
          auth: {
            start: '/auth/start',
            verify: '/auth/verify',
            in_chat: true,
          },
        }
      : null,
    auth: {
      start: '/auth/start',
      verify: '/auth/verify',
      in_chat: true,
    },
    launch: {
      api: '/api/os/launch',
      domains_attach: '/api/os/domains/attach',
      status: '/api/os/launch/status',
      options: ['indobase_subdomain', 'custom_domain'],
      tool: '/api/os/tools/launchBusiness',
      tool_alias: '/api/os/tools/goLive',
      rules: LAUNCH_AGENT_HARD_RULES,
    },
    tools: {
      launchBusiness: launchBusinessToolCatalog(),
    },
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

/** Legacy /start → open OS immediately (account creation happens in chat). */
app.get('/start', (c) => c.redirect('/'))

app.get('/', (c) => serveAgentDesktop(c))

app.get('/workspace', (c) => serveAgentDesktop(c))

const upstream = resolveCloudflareOsBase()
console.log(
  `[builder-cfos] listening on :${PORT} aud=${AUDIENCE} cfos=${upstream || '(unset)'} desktop=/ proxy=${OS_PREFIX}/`
)

createRuntimeProxyServer(app, PORT)
