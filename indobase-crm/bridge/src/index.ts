/**
 * Indobase CRM — Studio SSO bridge + reverse proxy to Twenty CRM.
 *
 * Studio → `/sso/launch#token=…` → bridge verifies JWT, provisions/signs into the
 * org's Twenty workspace, redirects to `/verify?loginToken=…`.
 * Customer UI is Indobase CRM only (never name the engine).
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
import { isHtmlContentType, rewriteBrandedHtml } from './brand-html.js'
import {
  buildCrmScopeMap,
  crmPipelinePath,
  crmWorkspaceOrigin,
  upstreamCrmPath,
} from './crm-map.js'
import { rewriteGraphqlOriginBody, rewriteUpstreamLocation } from './graphql-origin.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'
import {
  exchangeStudioUserForTwentyLoginToken,
  twentyVerifyPath,
} from './twenty-exchange.js'
import { countMappedWorkspaces, getOrgWorkspace } from './workspace-map.js'
import { renderCrmWelcomeHtml } from './welcome.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const CRM_PUBLIC_URL = (process.env.CRM_PUBLIC_URL || 'https://crm.indobase.in').replace(/\/+$/, '')
const CRM_UPSTREAM = (process.env.CRM_UPSTREAM || '').replace(/\/+$/, '')
/** Legacy single-workspace invite — claimed by the first org when the map is empty. */
const LEGACY_WORKSPACE_INVITE_HASH = (process.env.TWENTY_WORKSPACE_INVITE_HASH || '').trim()
/**
 * When true (default), SSO creates a Twenty workspace for orgs with no mapping.
 * Set false only for break-glass / read-only incident response.
 */
const ALLOW_CREATE_WORKSPACE =
  (process.env.TWENTY_ALLOW_BOOTSTRAP_WORKSPACE || 'true').toLowerCase() !== 'false'

function scopeFromSession(session: Session) {
  return buildCrmScopeMap({
    orgSlug: session.orgSlug,
    projectRef: session.projectRef,
    projectName: session.projectName,
    organizationName: session.organizationName,
  })
}

function sessionFromRequest(c: Context): Session | null {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return null
  }
  const raw = readCookie(c.req.header('cookie'))
  return raw ? readSessionToken(raw, secret) : null
}

function workspaceOriginForSession(session: Session | null): string | undefined {
  if (!session?.orgSlug) return undefined
  const map = scopeFromSession(session)
  const record = getOrgWorkspace(map.teamKey)
  if (!record?.subdomain) return undefined
  return crmWorkspaceOrigin(CRM_PUBLIC_URL, record.subdomain)
}

/** Cold visits must never reach upstream engine login UI. */
function respondUnauthenticatedCrm(c: Context) {
  const path = new URL(c.req.url).pathname
  const method = c.req.method
  const prefersHtml =
    !path.startsWith('/api/') &&
    !path.startsWith('/graphql') &&
    (method === 'GET' || method === 'HEAD') &&
    !/\.(js|css|map|woff2?|png|jpe?g|gif|svg|ico|webp|json)$/i.test(path)
  if (prefersHtml) {
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
    return c.html(renderCrmWelcomeHtml({ studioUrl: STUDIO_URL }))
  }
  return c.json({ error: 'unauthorized', signInUrl: `${STUDIO_URL}/sign-in` }, 401)
}

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
  if (!r.ok) {
    var reason = '';
    try { reason = ((await r.json()) || {}).error || ''; } catch (_) {}
    document.body.innerHTML =
      '<div style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;padding:24px;text-align:center;color:#1e293b">' +
      '<div style="max-width:34rem"><p style="font-weight:600;margin:0 0 8px">Could not open CRM</p>' +
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
  let workspaceMeta: { workspaceId?: string; subdomain?: string } = {}

  if (CRM_UPSTREAM) {
    try {
      const exchanged = await exchangeStudioUserForTwentyLoginToken({
        upstream: CRM_UPSTREAM,
        email: claims.email,
        handoffSecret: secret,
        orgSlug: claims.organization_slug,
        teamKey: map.teamKey,
        teamTitle: map.teamTitle,
        publicBaseUrl: CRM_PUBLIC_URL,
        legacyWorkspaceInviteHash: LEGACY_WORKSPACE_INVITE_HASH || undefined,
        allowCreateWorkspace: ALLOW_CREATE_WORKSPACE,
      })
      redirect = twentyVerifyPath(exchanged.loginToken, crmPipelinePath(map))
      workspaceMeta = {
        workspaceId: exchanged.workspaceId,
        subdomain: exchanged.subdomain,
      }
    } catch (err) {
      console.error('[crm] twenty handoff failed:', err)
      return c.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Could not establish the CRM workspace session. Try opening CRM from Studio again.',
        },
        502,
      )
    }
  }

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, scope: map, workspace: workspaceMeta })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', (c) => {
  const mapped = countMappedWorkspaces()
  const body = publicSsoHealth({
    service: 'indobase-crm',
    audience: AUDIENCE,
    versionEnvKeys: ['CRM_VERSION', 'GIT_SHA'],
    extra: {
      workspaceMapping: 'per-org',
      mappedWorkspaces: mapped,
      /** True when at least one org workspace is mapped, or a legacy invite exists for first claim. */
      inviteConfigured: mapped > 0 || Boolean(LEGACY_WORKSPACE_INVITE_HASH),
      createWorkspaceEnabled: ALLOW_CREATE_WORKSPACE,
    },
  }) as Record<string, unknown>
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  body.upstreamConfigured = Boolean(CRM_UPSTREAM)
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
  const map = scopeFromSession(s)
  const record = getOrgWorkspace(map.teamKey)
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    canEdit: s.canEdit,
    studioUrl: s.studioUrl,
    scope: map,
    pipelinePath: crmPipelinePath(map),
    workspace: record
      ? {
          workspaceId: record.workspaceId,
          subdomain: record.subdomain,
          displayName: record.displayName,
        }
      : null,
  })
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-crm' }))

async function proxyCrmAuthenticated(c: Context) {
  if (!sessionFromRequest(c)) return respondUnauthenticatedCrm(c)
  return proxyCrm(c)
}

async function proxyCrm(c: Context) {
  if (!CRM_UPSTREAM) return c.notFound()
  const url = new URL(c.req.url)
  const upstreamPath = upstreamCrmPath(url.pathname)
  const target = `${CRM_UPSTREAM}${upstreamPath}${url.search}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')

  const session = sessionFromRequest(c)
  const isGraphql =
    upstreamPath === '/graphql' ||
    upstreamPath.startsWith('/graphql') ||
    upstreamPath === '/metadata' ||
    upstreamPath.startsWith('/metadata')
  const method = c.req.method
  let body: ArrayBuffer | string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (isGraphql && session) {
      const text = await c.req.text()
      body = rewriteGraphqlOriginBody(text, {
        publicBaseUrl: CRM_PUBLIC_URL,
        orgSlug: session.orgSlug,
        workspaceOrigin: workspaceOriginForSession(session),
      })
      headers.delete('content-length')
    } else {
      body = await c.req.arrayBuffer()
    }
  }

  const res = await fetch(target, {
    method,
    headers,
    body,
    redirect: 'manual',
  })

  const outHeaders = new Headers(res.headers)
  const location = rewriteUpstreamLocation(outHeaders.get('location'), CRM_PUBLIC_URL)
  if (location) outHeaders.set('location', location)

  const rewritable =
    method !== 'HEAD' && res.body !== null && isHtmlContentType(res.headers.get('content-type'))
  if (!rewritable) {
    return new Response(res.body, { status: res.status, headers: outHeaders })
  }

  const rewritten = rewriteBrandedHtml(await res.text())
  outHeaders.delete('content-encoding')
  outHeaders.delete('content-length')
  outHeaders.delete('etag')
  outHeaders.delete('last-modified')
  return new Response(rewritten, { status: res.status, headers: outHeaders })
}

// Engine auth surfaces → Studio only
app.all('/welcome', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/sign-in', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/sign-up', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))

app.get('/', (c) => {
  const session = sessionFromRequest(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  if (CRM_UPSTREAM) {
    const map = scopeFromSession(session)
    return c.redirect(crmPipelinePath(map))
  }
  return c.html(renderCrmWelcomeHtml({ studioUrl: STUDIO_URL }))
})

/** Everything else requires a Studio bridge session, then proxies to Twenty. */
app.all('*', proxyCrmAuthenticated)

const port = Number(process.env.PORT || 8094)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[indobase-crm] listening on :${port}`)
})

export default app
