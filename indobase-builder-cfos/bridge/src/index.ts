/**
 * Indobase OS (Agentic Business OS) — Gen 3 bridge.
 *
 * Day-one entry: `/` (+ `/workspace` and `/workspace/*` deep links) mints a guest/signed-in
 * session cookie, then proxies the CFOS agent desktop as the top document (no outer header /
 * iframe shell). Optional `/api/indobase/proxy/*` hits the linked project.
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
  profileDisplayName,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  SESSION_COOKIE,
  sessionCookie,
  verifyStudioHandoff,
  withPreservedCfosBind,
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
  platformAuthMail,
  platformPromptQuota,
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
  LAUNCH_AGENT_HARD_RULES,
} from './launch-business-tool.js'
import { executeConnectGatewayTool } from './connect-gateway-tool.js'
import { executeWireCheckoutTool } from './wire-checkout-tool.js'
import {
  executeListShopOrders,
  executePlaceTestShopOrder,
  executeSetupShopCatalog,
} from './shop-catalog-tool.js'
import {
  executeEnsureAnalytics,
  executeEnsureDatabase,
  executeEnsureEmail,
  executeEnsureLogin,
} from './ensure-capability-tool.js'
import { executeApplySchema } from './apply-schema-tool.js'
import { executeGuidedBackend } from './guided-backend-chain.js'
import { executeProductionChecklist } from './production-checklist-tool.js'
import { executeResolveProductImages } from './product-images-tool.js'
import { parseFollowUps, resolveFollowUps, stripLeakedCot } from './followups.js'
import {
  buildAuthVerifySuccessPayload,
  buildClaimSessionSuccessPayload,
  buildSessionApiPayload,
} from './session-payload.js'
import { accountRequiredBody } from './guest-gates.js'
import { authErrorJsonBody, normalizeAuthRouteError } from './auth-errors.js'
import { renderLandingHtml, renderOfflineDesktopHtml, renderWorkspaceSignInRequiredHtml, injectIndobaseContextBootstrap } from './workspace-html.js'
import {
  BRIDGE_AGENT_BEGIN_TURN_PATH,
  interpretBeginTurnResult,
  shouldConsumeAgentTurn,
} from './agent-turn-meter.js'
import { deriveAgentCredentials } from './agent-credentials.js'
import {
  lookupAgentPrincipal,
  lookupMemberPrincipalForProject,
  rehydrateSessionBackend,
  rememberAgentPrincipal,
  updateAgentPrincipalBackend,
} from './agent-principal-store.js'
import { ensureAgentModelsAsync, openRouterKeyConfigured } from './ensure-agent-models.js'
import { syncBackendAfterEnsure, syncGuidedBackendResult } from './backend-session-sync.js'
import { isManagedBackendConfigured, resolvePlatformApiUrl } from './platform-api-client.js'
import { rememberPendingSession, takePendingSessionForClaim } from './pending-session-store.js'
import { bridgeSentryOnError, initBridgeSentry, injectBrowserSentry } from './sentry.js'
import { CFOS_SPA_SHELL_PREFIXES } from './cfos-spa-shell.js'

initBridgeSentry('builder-cfos')

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

/** Public URL CFOS AgentTools should call (seeded as INDOBASE_BRIDGE_URL). */
function resolveBridgePublicUrl(): string {
  return (
    process.env.INDOBASE_BRIDGE_URL?.trim() ||
    process.env.BUILDER_CFOS_PUBLIC_URL?.trim() ||
    process.env.BUILDER_PUBLIC_URL?.trim() ||
    'https://builder.indobase.in'
  ).replace(/\/+$/, '')
}

function isLoopbackBridgeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

function logBridgeStartupWarnings(): void {
  const bridgeUrl = resolveBridgePublicUrl()
  const version = publicVersion()
  if (isLoopbackBridgeUrl(bridgeUrl) && version !== 'dev') {
    console.warn(
      `[builder-cfos] WARN: INDOBASE_BRIDGE_URL is loopback (${bridgeUrl}) in prod — CFOS AgentTools will fail. Reseed with /usr/local/sbin/indobase-cfos-seed-indobase-vars.sh or use https://builder.indobase.in`,
    )
  }
  if (!resolvePlatformApiUrl()) {
    console.warn(
      '[builder-cfos] WARN: PLATFORM_API_URL / STUDIO_INTERNAL_URL unset — ensure*, OTP, and quota may return 503',
    )
  }
  if (!isManagedBackendConfigured()) {
    console.warn(
      '[builder-cfos] WARN: POCKETBASE_* env unset — managed backend ensure/guidedBackend paths may fail',
    )
  }
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
    return c.json(accountRequiredBody(), 403)
  }
  return sessionOrErr
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function respondEnsureTool(
  c: Context,
  session: Session,
  result: Awaited<ReturnType<typeof executeEnsureLogin>>,
) {
  await syncBackendAfterEnsure(c, getSession(c), result)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
}

/**
 * Cookie session OR CFOS AgentTool auth:
 *   X-Indobase-OS-Secret: BUILDER_CFOS_HANDOFF_SECRET
 *   X-Indobase-Agent-Username: ib_… (from /api/os/runtime/agent-credentials)
 * Principal must have been remembered when the browser fetched credentials.
 */
async function requireSignedInSessionOrAgentTool(c: Context): Promise<Session | Response> {
  const cookieSession = getSession(c)
  if (cookieSession) {
    if (isGuestSession(cookieSession)) {
      return c.json(accountRequiredBody(), 403)
    }
    return rehydrateSessionBackend(cookieSession)
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ message: 'Unauthorized — open Indobase OS and continue in chat' }, 401)
  }

  const provided =
    (c.req.header('x-indobase-os-secret') || c.req.header('X-Indobase-OS-Secret') || '').trim()
  const username =
    (c.req.header('x-indobase-agent-username') || c.req.header('X-Indobase-Agent-Username') || '').trim()

  if (!provided || !username || !timingSafeEqualString(provided, secret)) {
    return c.json({ message: 'Unauthorized — open Indobase OS and continue in chat' }, 401)
  }

  const principal = await lookupAgentPrincipal(username)
  if (!principal) {
    return c.json(
      {
        ok: false,
        code: 'agent_principal_unknown',
        message:
          'Agent session is not linked to an Indobase workspace yet. Reload Indobase OS so credentials can register, then retry Launch.',
      },
      401,
    )
  }
  if (principal.guest || principal.projectRef.startsWith('draft_')) {
    return c.json(accountRequiredBody(), 403)
  }

  return {
    gotrueId: principal.gotrueId,
    email: principal.email,
    projectRef: principal.projectRef,
    orgSlug: 'os',
    projectName: principal.projectName,
    studioUrl: process.env.INDOBASE_BUILDER_PUBLIC_URL?.trim() || 'https://builder.indobase.in',
    ...(principal.backend
      ? {
          backend: {
            ...principal.backend,
            project_url: principal.backend.project_url || principal.backend.api_url,
          },
        }
      : {}),
  }
}

/**
 * Cookie or AgentTool principal — guests allowed (for sessionStatus / claim flows).
 */
async function resolveSessionOrAgentPrincipal(
  c: Context,
): Promise<{ session: Session; guest: boolean } | Response> {
  const cookieSession = getSession(c)
  if (cookieSession) {
    const session = await rehydrateSessionBackend(cookieSession)
    return { session, guest: isGuestSession(session) }
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ message: 'Unauthorized — open Indobase OS and continue in chat' }, 401)
  }

  const provided =
    (c.req.header('x-indobase-os-secret') || c.req.header('X-Indobase-OS-Secret') || '').trim()
  const username =
    (c.req.header('x-indobase-agent-username') || c.req.header('X-Indobase-Agent-Username') || '').trim()

  if (!provided || !username || !timingSafeEqualString(provided, secret)) {
    return c.json({ message: 'Unauthorized — open Indobase OS and continue in chat' }, 401)
  }

  let principal = await lookupAgentPrincipal(username)
  if (!principal) {
    return c.json(
      {
        ok: false,
        code: 'agent_principal_unknown',
        message:
          'Agent session is not linked to an Indobase workspace yet. Reload Indobase OS so credentials can register.',
      },
      401,
    )
  }

  // OTP upgrades the browser to a member, but AgentTool may still present the
  // pre-claim guest username. Prefer a member principal for the same workspace.
  const looksGuest = Boolean(
    principal.guest || principal.projectRef.startsWith('draft_') || !principal.email?.includes('@'),
  )
  if (looksGuest && !principal.projectRef.startsWith('draft_')) {
    const member = await lookupMemberPrincipalForProject(principal.projectRef)
    if (member) principal = member
  }

  const guest = Boolean(
    principal.guest || principal.projectRef.startsWith('draft_') || !principal.email?.includes('@'),
  )
  const session: Session = {
    gotrueId: principal.gotrueId,
    email: principal.email,
    projectRef: principal.projectRef,
    orgSlug: guest ? 'guest' : 'os',
    projectName: principal.projectName,
    studioUrl: process.env.INDOBASE_BUILDER_PUBLIC_URL?.trim() || 'https://builder.indobase.in',
    ...(principal.backend
      ? {
          backend: {
            ...principal.backend,
            project_url: principal.backend.project_url || principal.backend.api_url,
          },
        }
      : {}),
  }
  return { guest, session }
}

/** Mint a guest workspace session so `/` opens the agent desktop immediately (account in chat). */
function ensureSessionForWorkspace(
  c: Context,
  opts?: { mintGuest?: boolean },
): { session: Session | null; setCookie?: string } {
  const existing = getSession(c)
  if (existing) return { session: existing }

  // Cookie present but unreadable/expired — never overwrite a signed-in cookie with a fresh guest.
  const rawCookie = readCookie(c.req.header('cookie'), SESSION_COOKIE)
  if (rawCookie) {
    return { session: null }
  }

  if (opts?.mintGuest === false) {
    return { session: null }
  }

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
async function serveAgentDesktop(
  c: Context,
  opts?: {
    /**
     * When true, proxy the request path as-is (CFOS deep links like
     * `/workspace/<id>?w=0`). Default overrides to `/` for shell entry.
     */
    preservePath?: boolean
  },
): Promise<Response> {
  const preservePath = Boolean(opts?.preservePath)
  // Deep links must not mint/open as guest — wrong CFOS principal → access denied.
  const { session, setCookie } = ensureSessionForWorkspace(c, { mintGuest: !preservePath })
  if (!session) {
    if (preservePath) {
      return c.html(renderWorkspaceSignInRequiredHtml())
    }
    return c.html(renderLandingHtml())
  }
  if (preservePath && isGuestSession(session)) {
    return c.html(renderWorkspaceSignInRequiredHtml())
  }
  const upstream = resolveCloudflareOsBase()
  if (!upstream) {
    if (setCookie) c.header('Set-Cookie', setCookie)
    return c.html(renderOfflineDesktopHtml(session))
  }

  const proxied = await proxyCloudflareOs(c, {
    upstreamBase: upstream,
    stripPrefix: '',
    ...(preservePath ? {} : { overridePath: '/' }),
  })

  const contentType = proxied.headers.get('content-type') || ''
  if (contentType.includes('text/html') && c.req.method === 'GET') {
    const html = injectBrowserSentry(injectIndobaseContextBootstrap(await proxied.text()))
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
app.onError(bridgeSentryOnError('builder-cfos'))

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

  const managedBackendConfigured = isManagedBackendConfigured()
  const bridgePublicUrl = resolveBridgePublicUrl()
  const bridgeUrlMisconfigured = isLoopbackBridgeUrl(bridgePublicUrl) && publicVersion() !== 'dev'
  // Bridge listener is this process — avoid hairpin fetch to public URL from inside Swarm.
  let bridgeReachable: boolean | null = true

  const ready =
    handoffConfigured &&
    Boolean(upstream) &&
    cloudflareOsReachable === true &&
    platformApiConfigured &&
    bridgeReachable === true &&
    !bridgeUrlMisconfigured

  return c.json({
    ok: true,
    ready,
    service: 'indobase-builder-cfos',
    audience: AUDIENCE,
    version: publicVersion(),
    handoffConfigured,
    platformApiConfigured,
    managedBackendConfigured,
    bridgePublicUrl,
    bridgeReachable,
    bridgeUrlMisconfigured,
    bridgeReseedScript: '/usr/local/sbin/indobase-cfos-seed-indobase-vars.sh',
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
 * Start OTP — Platform API (no data-plane provision). Same path for chat + Create account modal.
 */
app.post('/auth/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = body && typeof body.name === 'string' ? body.name.trim() : ''
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const dpdpConsent = Boolean(body && body.dpdpConsent === true)
  if (!name || !email || !email.includes('@')) {
    return c.json({ ok: false, message: 'Enter your name and a valid email.' }, 400)
  }
  if (!dpdpConsent) {
    return c.json(
      {
        ok: false,
        message:
          'Accept the Privacy Policy and Terms of Service to continue (DPDP consent required).',
      },
      400,
    )
  }

  const result = await platformOtpStart({ name, email, dpdpConsent })
  if (!result.ok) {
    const normalized = normalizeAuthRouteError(
      result.status,
      {
        message: result.message,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      'start',
    )
    if (normalized.retryAfterSeconds) {
      c.header('Retry-After', String(normalized.retryAfterSeconds))
    }
    return c.json(authErrorJsonBody(normalized), normalized.status as 400 | 429 | 502 | 503 | 504)
  }
  return c.json({ ok: true, email: result.email, next: 'verify' })
})

/**
 * Verify OTP — idempotent Free workspace (lazy backend), establish bridge session cookie.
 * AgentTool path: X-Indobase-OS-Secret + X-Indobase-Agent-Username → pending claim
 * (workerd cannot Set-Cookie on the browser).
 */
app.post('/auth/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = body && typeof body.name === 'string' ? body.name.trim() : ''
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = body && typeof body.token === 'string' ? body.token.trim() : ''
  if (!name || !email || !email.includes('@') || !token) {
    return c.json(
      { ok: false, message: 'Enter your name, email, and the verification code.' },
      400,
    )
  }

  const result = await platformOtpVerify({ name, email, token })
  if (!result.ok) {
    const normalized = normalizeAuthRouteError(
      result.status,
      {
        message: result.message,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      'verify',
    )
    if (normalized.retryAfterSeconds) {
      c.header('Retry-After', String(normalized.retryAfterSeconds))
    }
    return c.json(authErrorJsonBody(normalized), normalized.status as 400 | 429 | 502 | 503 | 504)
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json(
      {
        ok: false,
        message: 'Sign-in is temporarily unavailable. Please try again in a moment.',
      },
      503,
    )
  }

  const ws = result.session
  const previous = getSession(c)
  const session: Session = withPreservedCfosBind(
    {
      gotrueId: ws.gotrue_id,
      email: ws.email,
      projectRef: ws.workspace_ref,
      orgSlug: ws.organization_slug,
      projectName: ws.workspace_name,
      displayName: name,
      studioUrl: process.env.INDOBASE_BUILDER_PUBLIC_URL?.trim() || 'https://builder.indobase.in',
      backend: ws.backend ?? undefined,
    },
    previous,
  )
  const sessionToken = createSessionToken(session, secret)

  // Agent tool verify: stash for browser claim (no Set-Cookie from workerd).
  const provided =
    (c.req.header('x-indobase-os-secret') || c.req.header('X-Indobase-OS-Secret') || '').trim()
  const agentUsername =
    (c.req.header('x-indobase-agent-username') || c.req.header('X-Indobase-Agent-Username') || '').trim()
  if (provided && agentUsername && timingSafeEqualString(provided, secret)) {
    await rememberPendingSession({
      username: agentUsername,
      sessionToken,
      email: session.email,
      projectRef: session.projectRef,
    })
    await rememberAgentPrincipal({
      username: agentUsername,
      gotrueId: session.gotrueId,
      projectRef: session.projectRef,
      email: session.email,
      guest: false,
      projectName: session.projectName,
      backend: session.backend
        ? {
            api_url: session.backend.api_url,
            anon_key: session.backend.anon_key,
            auth_url: session.backend.auth_url,
            rest_url: session.backend.rest_url,
            storage_url: session.backend.storage_url,
            project_ref: session.backend.project_ref,
            project_name: session.backend.project_name,
            public_env: session.backend.public_env,
          }
        : undefined,
    })
    return c.json({
      ...buildAuthVerifySuccessPayload(session, ws.provision_state),
      pending_claim: true,
      message:
        'Verified. Your browser will finish sign-in automatically in a moment (or refresh Indobase OS).',
    })
  }

  // Replaces any prior guest/draft_* cookie with the real signed-in workspace session.
  // Next /api/session pull: guest=false, stage=member, onboarding=null.
  c.header('Set-Cookie', sessionCookie(sessionToken))
  return c.json(buildAuthVerifySuccessPayload(session, ws.provision_state))
})

/**
 * Session stage for agents + UI — cookie or AgentTool principal.
 * Members: skip OTP on every new chat. Guests: run authStart/authVerify once.
 */
app.get('/api/os/runtime/session-status', async (c) => {
  const resolved = await resolveSessionOrAgentPrincipal(c)
  if (resolved instanceof Response) return resolved
  const { session, guest } = resolved
  return c.json({
    ok: true,
    guest,
    stage: guest ? 'guest' : 'member',
    email: session.email || null,
    project_ref: session.projectRef,
    project_name: session.projectName || null,
    signed_in: !guest,
    message: guest
      ? 'Unsigned-in: complete account in chat (name+email+DPDP → authStart+authVerify) or Create account. Do not emit niche/recommendation cards until after verify. Then continue the original request.'
      : 'Signed in — do not ask for signup/OTP/Create account again. Continue the operator request immediately. Niche CHOICES are OK only after this point.',
  })
})

/**
 * Browser claims a session verified by the CFOS authVerify AgentTool.
 * Idempotent: no pending claim → upgraded=false (still ok).
 */
app.get('/api/os/auth/claim-session', async (c) => {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json(
      { ok: false, message: 'Sign-in is temporarily unavailable. Please try again in a moment.' },
      503,
    )
  }
  const creds = deriveAgentCredentials({
    handoffSecret: secret,
    gotrueId: sessionOrErr.gotrueId,
    projectRef: sessionOrErr.projectRef,
    cfosBindGotrueId: sessionOrErr.cfosBindGotrueId,
    cfosBindProjectRef: sessionOrErr.cfosBindProjectRef,
  })
  const headerAgent =
    (c.req.header('x-indobase-agent-username') || c.req.header('X-Indobase-Agent-Username') || '').trim()
  const pending = await takePendingSessionForClaim([creds.username, headerAgent])
  if (!pending) {
    // Already claimed, or verify used Set-Cookie directly — report current stage.
    const alreadyMember = !isGuestSession(sessionOrErr)
    return c.json({
      ok: true,
      upgraded: false,
      guest: !alreadyMember,
      stage: alreadyMember ? 'member' : 'guest',
      session_ready: alreadyMember,
    })
  }
  c.header('Set-Cookie', sessionCookie(pending.sessionToken))
  return c.json(
    buildClaimSessionSuccessPayload({
      email: pending.email,
      projectRef: pending.projectRef,
    }),
  )
})

/**
 * BYOK gateway keys — agent or operator pastes Razorpay/Stripe keys after PSP KYC.
 * Prefer agent tool POST /api/os/tools/connectGateway (same handler).
 * Accepts cookie session or CFOS AgentTool headers.
 */
async function handleConnectGatewayTool(c: Context, session: Session) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await executeConnectGatewayTool(
    {
      gotrueId: session.gotrueId,
      email: session.email,
      projectRef: session.projectRef,
    },
    {
      settlement_market:
        typeof body.settlement_market === 'string' ? body.settlement_market : undefined,
      settlementMarket:
        typeof body.settlementMarket === 'string' ? body.settlementMarket : undefined,
      key_id: typeof body.key_id === 'string' ? body.key_id : null,
      key_secret: typeof body.key_secret === 'string' ? body.key_secret : null,
      publishable_key: typeof body.publishable_key === 'string' ? body.publishable_key : null,
      secret_key: typeof body.secret_key === 'string' ? body.secret_key : null,
      webhook_secret: typeof body.webhook_secret === 'string' ? body.webhook_secret : null,
    },
  )
  const http = result.ok
    ? 200
    : result.status === 403
      ? 403
      : result.status === 400
        ? 400
        : 502
  return c.json(result, http)
}

app.post('/api/os/payments/connect-gateway', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleConnectGatewayTool(c, sessionOrErr)
})

/** Agent tool: connectGateway — HARD PATH when operator pastes PSP API keys. */
app.post('/api/os/tools/connectGateway', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleConnectGatewayTool(c, sessionOrErr)
})

app.post('/api/os/tools/connectPaymentGateway', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleConnectGatewayTool(c, sessionOrErr)
})

/**
 * Agent tool: wireCheckout — HARD PATH for hosted checkout_url after gateway keys.
 */
async function handleWireCheckoutTool(c: Context, session: Session) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await executeWireCheckoutTool(
    {
      gotrueId: session.gotrueId,
      email: session.email,
      projectRef: session.projectRef,
    },
    {
      plan_version_id:
        typeof body.plan_version_id === 'string' ? body.plan_version_id : null,
      plan_name: typeof body.plan_name === 'string' ? body.plan_name : null,
      price:
        typeof body.price === 'string' || typeof body.price === 'number' ? body.price : null,
      currency: typeof body.currency === 'string' ? body.currency : null,
      billing_period:
        typeof body.billing_period === 'string' ? body.billing_period : null,
      mode: typeof body.mode === 'string' ? body.mode : null,
      customer_id: typeof body.customer_id === 'string' ? body.customer_id : null,
      customer_name: typeof body.customer_name === 'string' ? body.customer_name : null,
      customer_email:
        typeof body.customer_email === 'string' ? body.customer_email : null,
      expires_in_hours:
        typeof body.expires_in_hours === 'number' ? body.expires_in_hours : null,
    },
  )
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'gateway_not_ready'
      ? 403
      : result.status === 400 ||
          result.code === 'price_required' ||
          result.code === 'customer_email_required'
        ? 400
        : 502
  return c.json(result, http)
}

app.post('/api/os/payments/wire-checkout', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleWireCheckoutTool(c, sessionOrErr)
})

app.post('/api/os/tools/wireCheckout', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleWireCheckoutTool(c, sessionOrErr)
})

app.post('/api/os/tools/wirePricing', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleWireCheckoutTool(c, sessionOrErr)
})

/**
 * Shop catalog / inventory — real tenant-DB backend (Naïve-parity catalog path).
 */
async function handleSetupShopCatalog(
  c: Context,
  session: Session,
  body?: Record<string, unknown>,
) {
  const payload = body ?? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
  const products = Array.isArray(payload.products)
    ? payload.products.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    : null
  const result = await executeSetupShopCatalog(
    {
      gotrueId: session.gotrueId,
      email: session.email,
      projectRef: session.projectRef,
    },
    {
      brand: typeof payload.brand === 'string' ? payload.brand : null,
      products,
      action: typeof payload.action === 'string' ? payload.action : 'setup',
    },
  )
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'database_required'
      ? 403
      : result.status === 400 || result.code === 'invalid_product'
        ? 400
        : 502
  return c.json(result, http)
}

async function handleListShopOrders(
  c: Context,
  session: Session,
  body?: Record<string, unknown>,
) {
  const payload = body ?? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
  const result = await executeListShopOrders(
    {
      gotrueId: session.gotrueId,
      email: session.email,
      projectRef: session.projectRef,
    },
    { brand: typeof payload.brand === 'string' ? payload.brand : null },
  )
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'database_required'
      ? 403
      : 502
  return c.json(result, http)
}

async function handlePlaceTestShopOrder(
  c: Context,
  session: Session,
  body?: Record<string, unknown>,
) {
  const payload = body ?? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
  const items = Array.isArray(payload.items)
    ? payload.items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    : null
  const result = await executePlaceTestShopOrder(
    {
      gotrueId: session.gotrueId,
      email: session.email,
      projectRef: session.projectRef,
    },
    {
      order_email:
        typeof payload.order_email === 'string'
          ? payload.order_email
          : typeof payload.customer_email === 'string'
            ? payload.customer_email
            : null,
      items,
      cleanup: typeof payload.cleanup === 'boolean' ? payload.cleanup : null,
      brand: typeof payload.brand === 'string' ? payload.brand : null,
    },
  )
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'database_required'
      ? 403
      : result.status === 400 || result.code === 'invalid_order'
        ? 400
        : 502
  return c.json(result, http)
}

app.post('/api/os/shop/catalog', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleSetupShopCatalog(c, sessionOrErr)
})

app.post('/api/os/tools/setupShopCatalog', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleSetupShopCatalog(c, sessionOrErr)
})

app.post('/api/os/tools/seedShopCatalog', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleSetupShopCatalog(c, sessionOrErr)
})

app.post('/api/os/shop/orders', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action.toLowerCase() : 'list'
  if (action === 'place' || action === 'test') {
    return handlePlaceTestShopOrder(c, sessionOrErr, body)
  }
  return handleListShopOrders(c, sessionOrErr, body)
})

app.post('/api/os/tools/listShopOrders', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleListShopOrders(c, sessionOrErr)
})

app.post('/api/os/tools/listShopCatalog', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleListShopOrders(c, sessionOrErr)
})

app.post('/api/os/tools/placeTestShopOrder', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handlePlaceTestShopOrder(c, sessionOrErr)
})

app.post('/api/os/tools/testShopCheckout', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handlePlaceTestShopOrder(c, sessionOrErr)
})

/** ensureLogin / ensureDatabase — any web app capability hard paths. */
app.post('/api/os/tools/ensureLogin', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureLogin(sessionOrErr)
  return respondEnsureTool(c, sessionOrErr, result)
})

app.post('/api/os/tools/enableLogin', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureLogin(sessionOrErr)
  return respondEnsureTool(c, sessionOrErr, result)
})

app.post('/api/os/tools/ensureDatabase', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureDatabase(sessionOrErr)
  return respondEnsureTool(c, sessionOrErr, result)
})

app.post('/api/os/tools/ensureBusinessData', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureDatabase(sessionOrErr)
  return respondEnsureTool(c, sessionOrErr, result)
})

app.post('/api/os/tools/ensureEmail', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureEmail(sessionOrErr)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

app.post('/api/os/tools/enableEmail', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureEmail(sessionOrErr)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

app.post('/api/os/tools/ensureAnalytics', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureAnalytics(sessionOrErr)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

app.post('/api/os/tools/ensureEvents', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureAnalytics(sessionOrErr)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

app.post('/api/os/tools/enableAnalytics', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await executeEnsureAnalytics(sessionOrErr)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

/** resolveFollowUps — parse INDOBASE_FOLLOWUPS blocks and inject ladder chips (debug / CFOS UI). */
app.post('/api/os/tools/followups', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { message?: string }
  const message = typeof body.message === 'string' ? body.message : ''
  if (!message.trim()) {
    return c.json({ ok: false, error: 'message required' }, 400)
  }
  const cleaned = stripLeakedCot(message)
  const parsed = parseFollowUps(cleaned)
  const resolved = resolveFollowUps(message)
  return c.json({
    ok: true,
    cleaned_message: cleaned,
    parsed,
    resolved,
  })
})

/** resolveProductImages — Openverse commercial URLs for catalogs. */
app.post('/api/os/media/product-images', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q): q is string => typeof q === 'string')
    : typeof body.query === 'string'
      ? [body.query]
      : []
  const result = await executeResolveProductImages(sessionOrErr, {
    queries,
    page_size: typeof body.page_size === 'number' ? body.page_size : undefined,
  })
  return c.json(
    result,
    result.ok ? 200 : result.code === 'query_required' ? 400 : result.status === 403 ? 403 : 502,
  )
})

app.post('/api/os/tools/resolveProductImages', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q): q is string => typeof q === 'string')
    : typeof body.query === 'string'
      ? [body.query]
      : []
  const result = await executeResolveProductImages(sessionOrErr, {
    queries,
    page_size: typeof body.page_size === 'number' ? body.page_size : undefined,
  })
  return c.json(
    result,
    result.ok ? 200 : result.code === 'query_required' ? 400 : result.status === 403 ? 403 : 502,
  )
})

app.post('/api/os/tools/findProductImages', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q): q is string => typeof q === 'string')
    : typeof body.query === 'string'
      ? [body.query]
      : []
  const result = await executeResolveProductImages(sessionOrErr, {
    queries,
    page_size: typeof body.page_size === 'number' ? body.page_size : undefined,
  })
  return c.json(
    result,
    result.ok ? 200 : result.code === 'query_required' ? 400 : result.status === 403 ? 403 : 502,
  )
})

/** applySchema — declarative data model for any app. */
app.post('/api/os/data/apply-schema', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const tables = Array.isArray(body.tables)
    ? body.tables.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    : null
  const result = await executeApplySchema(sessionOrErr, {
    brand: typeof body.brand === 'string' ? body.brand : null,
    tables,
  })
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'database_required'
      ? 403
      : result.status === 400 ||
          result.code === 'tables_required' ||
          result.code === 'invalid_schema'
        ? 400
        : 502
  return c.json(result, http)
})

app.post('/api/os/tools/applySchema', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const tables = Array.isArray(body.tables)
    ? body.tables.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    : null
  const result = await executeApplySchema(sessionOrErr, {
    brand: typeof body.brand === 'string' ? body.brand : null,
    tables,
  })
  const http = result.ok
    ? 200
    : result.status === 403 || result.code === 'database_required'
      ? 403
      : result.status === 400 ||
          result.code === 'tables_required' ||
          result.code === 'invalid_schema'
        ? 400
        : 502
  return c.json(result, http)
})

/** guidedBackend — ensureDatabase → schema/catalog when live data is needed (after preview or backend chip). */
app.post('/api/os/tools/guidedBackend', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await executeGuidedBackend(sessionOrErr, {
    mode: typeof body.mode === 'string' ? body.mode : null,
    vertical: typeof body.vertical === 'string' ? body.vertical : null,
    brand: typeof body.brand === 'string' ? body.brand : null,
    place_test_order:
      typeof body.place_test_order === 'boolean' ? body.place_test_order : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
    subdomain: typeof body.subdomain === 'string' ? body.subdomain : undefined,
    html: typeof body.html === 'string' ? body.html : undefined,
    files:
      body.files && typeof body.files === 'object' && !Array.isArray(body.files)
        ? (body.files as Record<string, string>)
        : undefined,
    admin_html_as: typeof body.admin_html_as === 'string' ? body.admin_html_as : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
  })
  if (result.backend) {
    await syncGuidedBackendResult(c, getSession(c), sessionOrErr, result)
  }
  const http = result.ok ? 200 : result.code === 'database_required' ? 403 : 502
  return c.json(result, http)
})

app.post('/api/os/tools/runGuidedBackend', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await executeGuidedBackend(sessionOrErr, {
    mode: typeof body.mode === 'string' ? body.mode : null,
    vertical: typeof body.vertical === 'string' ? body.vertical : null,
    brand: typeof body.brand === 'string' ? body.brand : null,
    place_test_order:
      typeof body.place_test_order === 'boolean' ? body.place_test_order : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
    subdomain: typeof body.subdomain === 'string' ? body.subdomain : undefined,
    html: typeof body.html === 'string' ? body.html : undefined,
    files:
      body.files && typeof body.files === 'object' && !Array.isArray(body.files)
        ? (body.files as Record<string, string>)
        : undefined,
    admin_html_as: typeof body.admin_html_as === 'string' ? body.admin_html_as : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
  })
  if (result.backend) {
    await syncGuidedBackendResult(c, getSession(c), sessionOrErr, result)
  }
  const http = result.ok ? 200 : result.code === 'database_required' ? 403 : 502
  return c.json(result, http)
})

/** productionChecklist — claim gate for any app type. */
app.post('/api/os/production/checklist', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const checks =
    body.checks && typeof body.checks === 'object' && !Array.isArray(body.checks)
      ? (body.checks as Record<string, unknown>)
      : null
  const result = await executeProductionChecklist(sessionOrErr, {
    app_type: typeof body.app_type === 'string' ? body.app_type : null,
    live_url: typeof body.live_url === 'string' ? body.live_url : null,
    brand: typeof body.brand === 'string' ? body.brand : null,
    checks,
  })
  return c.json(result, 200)
})

app.post('/api/os/tools/productionChecklist', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const checks =
    body.checks && typeof body.checks === 'object' && !Array.isArray(body.checks)
      ? (body.checks as Record<string, unknown>)
      : null
  const result = await executeProductionChecklist(sessionOrErr, {
    app_type: typeof body.app_type === 'string' ? body.app_type : null,
    live_url: typeof body.live_url === 'string' ? body.live_url : null,
    brand: typeof body.brand === 'string' ? body.brand : null,
    checks,
  })
  return c.json(result, 200)
})

app.post('/api/os/tools/claimProductionReady', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const checks =
    body.checks && typeof body.checks === 'object' && !Array.isArray(body.checks)
      ? (body.checks as Record<string, unknown>)
      : null
  const result = await executeProductionChecklist(sessionOrErr, {
    app_type: typeof body.app_type === 'string' ? body.app_type : null,
    live_url: typeof body.live_url === 'string' ? body.live_url : null,
    brand: typeof body.brand === 'string' ? body.brand : null,
    checks,
  })
  return c.json(result, 200)
})

/** Lazy Ensurer proxy — capability.ensure via Platform API. */
app.post('/api/os/runtime/ensure', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = await c.req.json().catch(() => ({}))
  const capability =
    body && typeof body.capability === 'string' ? body.capability.trim() : 'auth'
  const settlementMarket =
    body && typeof body.settlement_market === 'string'
      ? body.settlement_market.trim()
      : body && typeof body.settlementMarket === 'string'
        ? body.settlementMarket.trim()
        : body && typeof body.settlement_adapter === 'string'
          ? body.settlement_adapter.trim()
          : body && typeof body.adapter === 'string'
            ? body.adapter.trim()
            : undefined
  const result = await platformRuntimeEnsure({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    capability,
    settlementMarket,
  })
  await syncBackendAfterEnsure(c, getSession(c), result)
  return c.json(result, result.ok ? 200 : result.status === 403 ? 403 : 502)
})

/**
 * Product Auth login mail — brand OTP From (fleet SMTP; Indobase-native copy).
 * GET = status; POST = { mode: 'indobase'|'branded', from_email?, from_name? }
 */
app.get('/api/os/auth/mail', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await platformAuthMail({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
  })
  return c.json(result, result.ok ? 200 : result.httpStatus >= 400 ? result.httpStatus : 502)
})

app.post('/api/os/auth/mail', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const body = (await c.req.json().catch(() => ({}))) as {
    mode?: string
    from_email?: string
    fromEmail?: string
    from_name?: string
    fromName?: string
  }
  const mode =
    body.mode === 'indobase' || body.mode === 'branded' ? body.mode : undefined
  const result = await platformAuthMail({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    mode,
    fromEmail: body.from_email || body.fromEmail,
    fromName: body.from_name || body.fromName,
    consume: true,
  })
  return c.json(result, result.ok ? 200 : result.httpStatus >= 400 ? result.httpStatus : 502)
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
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleStaticGoLive(c, sessionOrErr)
})

/**
 * Agent tool: launchBusiness / goLive — HARD PATH.
 * Requires real html or files; claim_live only when API returns a real URL.
 * Cookie session OR CFOS AgentTool headers (secret + ib_ username).
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
      app_type: typeof body.app_type === 'string' ? body.app_type : undefined,
      require_backend:
        typeof body.require_backend === 'boolean' ? body.require_backend : undefined,
      gotrueId: session.gotrueId,
      email: session.email,
    },
    { title: session.projectName || session.projectRef, backend: session.backend ?? null },
  )
  const http =
    result.ok ? 200 : result.status === 'rejected' || result.code === 'backend_required' ? 400 : 502
  return c.json(result, http)
}

app.post('/api/os/tools/launchBusiness', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  return handleLaunchBusinessTool(c, sessionOrErr)
})

app.post('/api/os/tools/goLive', async (c) => {
  const sessionOrErr = await requireSignedInSessionOrAgentTool(c)
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

/**
 * OS agent prompt quota — shares Free Builder meter (saas.organizations.builder_prompts_used).
 * GET = check; POST = consume one prompt. Guests blocked (account_required).
 */
app.get('/api/os/usage/prompt-quota', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await platformPromptQuota({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    consume: false,
  })
  return c.json(result, result.ok ? 200 : result.httpStatus >= 400 ? result.httpStatus : 502)
})

app.post('/api/os/usage/prompt-quota', async (c) => {
  const sessionOrErr = requireSignedInSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const result = await platformPromptQuota({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    consume: true,
  })
  const status = result.ok ? 200 : result.httpStatus === 402 ? 402 : result.httpStatus >= 400 ? result.httpStatus : 502
  return c.json(result, status)
})

/**
 * Hard CFOS chat-turn meter — ChatInterface calls this before every user send.
 * Guests: always ok (no consume) so OTP signup chat can proceed.
 * Signed-in Free: consumes Builder meter when shouldConsumeAgentTurn.
 */
app.post(BRIDGE_AGENT_BEGIN_TURN_PATH, async (c) => {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr

  let message: string | undefined
  try {
    const body = await c.req.json().catch(() => null)
    if (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string') {
      message = (body as { message: string }).message
    }
  } catch {
    message = undefined
  }

  // Guests must be able to chat (account OTP gate). Meter only after verify.
  if (isGuestSession(sessionOrErr)) {
    return c.json({
      ok: true,
      guest: true,
      stage: 'guest',
      signed_in: false,
      email: null,
      consumed: false,
      quota: null,
      code: null,
      message: null,
    })
  }

  const consume = shouldConsumeAgentTurn({ message })
  const result = await platformPromptQuota({
    gotrueId: sessionOrErr.gotrueId,
    email: sessionOrErr.email,
    workspaceRef: sessionOrErr.projectRef,
    consume,
  })

  const interpreted = interpretBeginTurnResult(result.httpStatus, result)
  const status = interpreted.ok
    ? 200
    : interpreted.exhausted
      ? 402
      : interpreted.accountRequired
        ? 403
        : result.httpStatus >= 400
          ? result.httpStatus
          : 502

  return c.json(
    {
      ok: interpreted.ok,
      guest: false,
      stage: 'member',
      signed_in: true,
      email: sessionOrErr.email || null,
      quota: interpreted.quota ?? result.quota ?? null,
      code: interpreted.code,
      message: interpreted.message ?? (interpreted.ok ? null : result.message ?? null),
      consumed: consume && interpreted.ok,
    },
    status,
  )
})

/**
 * Per-session CFOS runtime principal (guest or signed-in).
 * Username/password derived from session + handoff secret — never shared `dev`/`devpassword`.
 */
app.get('/api/os/runtime/agent-credentials', async (c) => {
  const sessionOrErr = requireSession(c)
  if (sessionOrErr instanceof Response) return sessionOrErr
  const session = await rehydrateSessionBackend(sessionOrErr)
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return c.json(
      {
        ok: false,
        code: 'handoff_secret_missing',
        message: err instanceof Error ? err.message : 'Handoff secret not configured',
      },
      503,
    )
  }
  const creds = deriveAgentCredentials({
    handoffSecret: secret,
    gotrueId: session.gotrueId,
    projectRef: session.projectRef,
    cfosBindGotrueId: session.cfosBindGotrueId,
    cfosBindProjectRef: session.cfosBindProjectRef,
  })
  // Link CFOS username → Indobase workspace so the workerd launchBusiness tool can auth.
  await rememberAgentPrincipal({
    username: creds.username,
    gotrueId: session.gotrueId,
    projectRef: session.projectRef,
    email: session.email || '',
    guest: isGuestSession(session),
    projectName: session.projectName,
    backend: session.backend
      ? {
          api_url: session.backend.api_url,
          anon_key: session.backend.anon_key,
          auth_url: session.backend.auth_url,
          rest_url: session.backend.rest_url,
          storage_url: session.backend.storage_url,
          project_ref: session.backend.project_ref,
          project_name: session.backend.project_name,
          public_env: session.backend.public_env,
        }
      : undefined,
  })
  if (session.backend?.api_url && session.backend?.anon_key) {
    await updateAgentPrincipalBackend(creds.username, session.backend)
  }
  // Seed OpenRouter models for this principal (model picker removed — without this, chat is silent).
  const displayName = profileDisplayName(session)
  ensureAgentModelsAsync({
    username: creds.username,
    password: creds.password,
    displayName: displayName || undefined,
  })
  const guest = isGuestSession(session)
  // Never log password.
  return c.json({
    ok: true,
    username: creds.username,
    password: creds.password,
    storage_key: creds.storage_key,
    guest,
    stage: guest ? 'guest' : 'member',
    signed_in: !guest,
    email: session.email || null,
    display_name: displayName || null,
    project_ref: session.projectRef,
    modelsEnsuring: openRouterKeyConfigured(),
  })
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

app.get('/api/session', async (c) => {
  const rawSession = getSession(c)
  if (!rawSession) return c.json({ message: 'Unauthorized' }, 401)
  const session = await rehydrateSessionBackend(rawSession)
  const upstream = resolveCloudflareOsBase()
  const agent = buildAgentSessionContext(session)
  const guest = isGuestSession(session)

  // Signed-in: expose live Free-meter snapshot so agents/UI see remaining before codegen.
  let promptQuota = null
  if (!guest) {
    const quotaResult = await platformPromptQuota({
      gotrueId: session.gotrueId,
      email: session.email,
      workspaceRef: session.projectRef,
      consume: false,
    })
    if (quotaResult.ok && quotaResult.quota) {
      promptQuota = quotaResult.quota
    }
  }

  let launchStatus = null
  try {
    launchStatus = await getLaunchStatus(session.projectRef)
  } catch {
    launchStatus = null
  }

  return c.json(
    buildSessionApiPayload({
      session,
      agentHint: agent.agentHint,
      generation: agent.generation,
      agentRuntimeConfigured: Boolean(upstream),
      agentRuntimeUrl: upstream || null,
      osProxyPath: `${OS_PREFIX}/`,
      indobaseProxyPath: '/api/indobase/proxy/',
      promptQuota,
      launchStatus,
    }),
  )
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

/**
 * Public CFOS static shell (hashed Vite assets + favicon). Must not require a
 * session cookie — module scripts with `crossorigin` and first-paint requests
 * can race the Set-Cookie from GET /, which previously 401'd the JS/CSS and
 * left builder.indobase.in looking broken / "404".
 */
async function proxyPublicRuntime(c: Context) {
  const upstream = resolveCloudflareOsBase()
  if (!upstream) {
    return c.json(
      {
        message: 'CLOUDFLARE_OS_URL is not set. Run scripts/dev-stack.sh or export the URL.',
      },
      503,
    )
  }
  return proxyCloudflareOs(c, { upstreamBase: upstream, stripPrefix: '' })
}

// Root-absolute CF OS static assets (Vite build emits `/assets/...`).
app.all('/assets/*', (c) => proxyPublicRuntime(c))

// CFOS index references `/favicon.svg` at the site root (not under /assets).
app.get('/favicon.svg', (c) => proxyPublicRuntime(c))
app.get('/favicon.ico', (c) => proxyPublicRuntime(c))

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
// CFOS SPA deep-links here; without this catch-all a refresh shows bare "404 Not Found".
app.all('/workspace/*', (c) => serveAgentDesktop(c, { preservePath: true }))

/**
 * CFOS client-router shell routes (plural). Hard refresh / bookmarks must serve the
 * SPA index — upstream workerd already SPA-fallbacks these; the bridge must route
 * them (otherwise Hono returns plain "404 Not Found").
 * Serve like `/` (mint guest + index) so guests can open the shell; keep
 * `/workspace/<id>` on preservePath for principal safety.
 */
for (const prefix of CFOS_SPA_SHELL_PREFIXES) {
  app.get(prefix, (c) => serveAgentDesktop(c))
  app.all(`${prefix}/*`, (c) => serveAgentDesktop(c))
}

logBridgeStartupWarnings()

const upstream = resolveCloudflareOsBase()
console.log(
  `[builder-cfos] listening on :${PORT} aud=${AUDIENCE} cfos=${upstream || '(unset)'} bridge=${resolveBridgePublicUrl()} desktop=/ proxy=${OS_PREFIX}/`
)

createRuntimeProxyServer(app, PORT)