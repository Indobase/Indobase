/**
 * Indobase Workspace — Studio SSO bridge + document editor + file shell + Meetings.
 *
 * Studio hands off to `/sso/launch#token=…`. Bridge verifies `aud=indobase-suite`,
 * sets `indobase_suite_session`, serves the Indobase file/workspace UI, embeds the
 * document editor (JWT + callback), and embeds Indobase Meetings via IFrame API.
 * Customer chrome never names upstream engines.
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  mintFileAccessToken,
  contentTypeForExt,
  createFile,
  deleteFile,
  getFile,
  listFiles,
  readFileBytes,
  saveFileBytes,
  verifyFileAccessToken,
  type WorkspaceFileKind,
} from './files.js'
import { isSuiteModuleId, listModulesForApi, modulePath } from './modules.js'
import {
  bridgeInternalUrl,
  resolveDocumentJwtSecret,
  buildEditorConfig,
  documentServerHealth,
  documentServerUpstream,
  documentServerUpstreamPath,
  isDocumentServerConfigured,
  isDocumentServerProxyPath,
  PROXY_SKIP_RESPONSE_HEADERS,
  rewriteDocumentServerLocation,
} from './onlyoffice.js'
import {
  buildCalendarEmbedConfig,
  isCalendarConfigured,
} from './calendar.js'
import {
  buildMeetingsLaunchConfig,
  isMeetingsConfigured,
  meetingsJwtConfigured,
} from './meetings.js'
import { publicSsoHealth, securityHeaders } from './security-headers.js'
import { renderEditorPage, renderLaunchHtml, renderWorkspaceShell } from './shell.js'
import { isDocumentWelcomePath, renderWorkspaceWelcomeHtml } from './welcome.js'
import { buildWorkspaceMap, workspaceHomePath } from './workspace-map.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()
app.use('*', securityHeaders)

const STUDIO_URL = (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
const EMAIL_PUBLIC_URL = (process.env.INDOBASE_EMAIL_URL || 'https://email.indobase.in').replace(
  /\/+$/,
  ''
)
const DESIGN_PUBLIC_URL = (
  process.env.INDOBASE_DESIGN_URL || 'https://design.indobase.in'
).replace(/\/+$/, '')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_ROOT = path.resolve(__dirname, '../public')

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

async function requireSession(c: Context<{ Variables: Vars }>, next: Next) {
  const session = sessionFromRequest(c)
  if (!session) {
    return c.json({ error: 'unauthorized', signInUrl: `${STUDIO_URL}/sign-in` }, 401)
  }
  c.set('session', session)
  await next()
}

// Brand assets (copied from packages/common/assets/brand)
app.use(
  '/brand/*',
  serveStatic({
    root: PUBLIC_ROOT,
  })
)

// ── SSO ──────────────────────────────────────────────────────────────────────

app.get('/sso/launch', (c) => c.html(renderLaunchHtml(STUDIO_URL)))

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

  const redirect = resolveRedirectFromQuery(c.req.url.split('?')[1] || '', {
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

  c.res.headers.append('Set-Cookie', sessionCookie(createSessionToken(claims, secret)))
  return c.json({ ok: true, redirect, workspace: map })
})

app.post('/sso/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/sso/health', async (c) => {
  const body = publicSsoHealth({
    service: 'indobase-workspace',
    audience: AUDIENCE,
    versionEnvKeys: ['SUITE_VERSION', 'GIT_SHA'],
    extra: { modules: listModulesForApi() },
  })
  try {
    resolveHandoffSecret()
    body.handoffConfigured = true
  } catch {
    body.handoffConfigured = false
  }
  ;(body as { editorReady?: boolean }).editorReady = isDocumentServerConfigured()
    ? await documentServerHealth()
    : false
  ;(body as { meetingsReady?: boolean; meetingsJwt?: boolean }).meetingsReady = isMeetingsConfigured()
  ;(body as { meetingsJwt?: boolean }).meetingsJwt = meetingsJwtConfigured()
  ;(body as { calendarReady?: boolean }).calendarReady = isCalendarConfigured()
  return c.json(body)
})

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
    editorReady: isDocumentServerConfigured(),
    meetingsReady: isMeetingsConfigured(),
    calendarReady: isCalendarConfigured(),
  })
})

app.get('/api/meetings/config', requireSession, (c) => {
  const session = c.get('session')
  return c.json(buildMeetingsLaunchConfig(session))
})

app.get('/api/calendar/config', requireSession, (c) => {
  const session = c.get('session')
  return c.json(buildCalendarEmbedConfig(session))
})

app.get('/healthz', (c) => c.json({ ok: true, service: 'indobase-workspace' }))

app.all('/login', (c) => c.redirect(`${STUDIO_URL}/sign-in`))
app.all('/logout', (c) => c.redirect(`${STUDIO_URL}/sign-in`))

/** Never expose DocumentServer’s Community Edition landing page. */
function blockDocumentWelcome(c: Context) {
  const session = sessionFromRequest(c)
  if (session) {
    const map = workspaceMapFromSession(session)
    return c.redirect(workspaceHomePath(map), 302)
  }
  return c.html(renderWorkspaceWelcomeHtml({ studioUrl: STUDIO_URL }), 200)
}

app.all('/welcome', (c) => blockDocumentWelcome(c))
app.all('/welcome/*', (c) => blockDocumentWelcome(c))
app.all('/ds/welcome', (c) => blockDocumentWelcome(c))
app.all('/ds/welcome/*', (c) => blockDocumentWelcome(c))
app.get('/ds', (c) => blockDocumentWelcome(c))
app.get('/ds/', (c) => blockDocumentWelcome(c))

// ── File API ─────────────────────────────────────────────────────────────────

app.get('/api/files', requireSession, async (c) => {
  const s = c.get('session')
  const kind = c.req.query('kind') as WorkspaceFileKind | undefined
  const files = await listFiles(s.projectRef, kind || undefined)
  return c.json({ files })
})

app.post('/api/files', requireSession, async (c) => {
  const s = c.get('session')
  if (!s.canEdit) return c.json({ error: 'viewers cannot create files' }, 403)
  let body: { name?: string; kind?: WorkspaceFileKind }
  try {
    body = (await c.req.json()) as { name?: string; kind?: WorkspaceFileKind }
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }
  const kind = body.kind || 'doc'
  if (!['doc', 'sheet', 'slide'].includes(kind)) {
    return c.json({ error: 'kind must be doc, sheet, or slide' }, 400)
  }
  const name = (body.name || 'Untitled').trim().slice(0, 180) || 'Untitled'
  const meta = await createFile({
    projectRef: s.projectRef,
    name,
    kind,
    createdBy: s.email,
  })
  return c.json(meta, 201)
})

app.delete('/api/files/:id', requireSession, async (c) => {
  const s = c.get('session')
  if (!s.canEdit) return c.json({ error: 'viewers cannot delete files' }, 403)
  const id = c.req.param('id') || ''
  const ok = await deleteFile(s.projectRef, id)
  if (!ok) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

/** Document engine download — HMAC access token (no browser cookie). */
app.get('/api/files/:id/content', async (c) => {
  const fileId = c.req.param('id') || ''
  const access = c.req.query('access') || ''
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 'sso not configured' }, 503)
  }
  const claims = verifyFileAccessToken(secret, access)
  if (!claims || claims.fileId !== fileId) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  /*
   * DocumentServer surfaces every failure here as a bare "Download failed" dialog, so a silent 404
   * was indistinguishable from a bad token, a missing blob, or an unreachable bridge. Log the
   * actual cause and return a distinguishable body — this endpoint is only reachable with a valid
   * HMAC access token, so the detail is not exposed to anonymous callers.
   */
  const meta = await getFile(claims.projectRef, claims.fileId)
  if (!meta) {
    console.error('[suite] content: no index entry', {
      projectRef: claims.projectRef,
      fileId: claims.fileId,
    })
    return c.json({ error: 'not found', reason: 'no-index-entry' }, 404)
  }

  const bytes = await readFileBytes(claims.projectRef, claims.fileId)
  if (!bytes || bytes.length === 0) {
    console.error('[suite] content: blob missing or empty', {
      projectRef: claims.projectRef,
      fileId: claims.fileId,
      name: meta.name,
      indexSize: meta.size,
      bytes: bytes ? bytes.length : null,
    })
    return c.json({ error: 'not found', reason: bytes ? 'empty-blob' : 'no-blob' }, 404)
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentTypeForExt(meta.ext),
      'Content-Disposition': `attachment; filename="${meta.name.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
})

/*
 * Reproduces exactly what DocumentServer does when it opens a file, from inside the bridge:
 * mint the access token, then fetch our own BRIDGE_INTERNAL_URL content endpoint. If DS shows
 * "Download failed" this says which hop broke — token, storage, or the internal network path.
 * Session-gated: it reveals internal URLs.
 */
app.get('/api/documents/diagnose/:id', requireSession, async (c) => {
  const session = c.get('session')
  const fileId = c.req.param('id') || ''
  const out: Record<string, unknown> = {
    fileId,
    bridgeInternalUrl: bridgeInternalUrl(),
    documentServerConfigured: isDocumentServerConfigured(),
  }

  try {
    out.documentServerHealthy = await documentServerHealth()
  } catch (err) {
    out.documentServerHealthy = false
    out.documentServerHealthError = String(err).slice(0, 200)
  }

  let secret = ''
  try {
    secret = resolveHandoffSecret()
    out.handoffSecretConfigured = true
  } catch {
    out.handoffSecretConfigured = false
    return c.json({ ...out, verdict: 'handoff secret missing — cannot mint access token' }, 200)
  }

  try {
    resolveDocumentJwtSecret()
    out.documentJwtSecretConfigured = true
  } catch (err) {
    out.documentJwtSecretConfigured = false
    out.documentJwtSecretError = String(err).slice(0, 160)
  }

  const meta = await getFile(session.projectRef, fileId)
  out.indexEntry = meta ? { name: meta.name, ext: meta.ext, size: meta.size } : null

  const bytes = meta ? await readFileBytes(session.projectRef, fileId) : null
  out.blobBytes = bytes ? bytes.length : null

  // The hop that actually fails in production: DS -> BRIDGE_INTERNAL_URL.
  if (meta) {
    const access = mintFileAccessToken(secret, session.projectRef, fileId)
    const url = `${bridgeInternalUrl()}/api/files/${encodeURIComponent(fileId)}/content?access=${encodeURIComponent(access)}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      out.selfFetch = {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        body: res.ok ? undefined : (await res.text()).slice(0, 200),
      }
    } catch (err) {
      out.selfFetch = { failed: String(err).slice(0, 200) }
    }
  }

  const self = out.selfFetch as { status?: number; failed?: string } | undefined
  out.verdict = !meta
    ? 'no index entry for this id'
    : !bytes
      ? 'index entry exists but blob is missing on disk'
      : self?.failed
        ? 'bridge cannot reach its own BRIDGE_INTERNAL_URL — DocumentServer cannot either'
        : self?.status === 200
          ? 'download path is healthy from inside the bridge'
          : `internal content fetch returned ${self?.status}`

  return c.json(out)
})

/** Document engine save callback. */
app.post('/api/files/:id/callback', async (c) => {
  const fileId = c.req.param('id') || ''
  const access = c.req.query('access') || ''
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 1 })
  }
  const claims = verifyFileAccessToken(secret, access)
  if (!claims || claims.fileId !== fileId) {
    return c.json({ error: 1 })
  }

  let payload: { status?: number; url?: string }
  try {
    payload = (await c.req.json()) as { status?: number; url?: string }
  } catch {
    return c.json({ error: 0 })
  }

  // status 2 = ready for saving, 6 = force-save
  if ((payload.status === 2 || payload.status === 6) && payload.url) {
    try {
      const res = await fetch(payload.url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) {
        console.error('[workspace] callback download failed', res.status)
        return c.json({ error: 1 })
      }
      const buf = Buffer.from(await res.arrayBuffer())
      await saveFileBytes(claims.projectRef, claims.fileId, buf)
    } catch (err) {
      console.error('[workspace] callback save failed:', err)
      return c.json({ error: 1 })
    }
  }

  return c.json({ error: 0 })
})

// ── Editor page ──────────────────────────────────────────────────────────────

app.get('/editor/:id', async (c) => {
  const session = sessionFromRequest(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const meta = await getFile(session.projectRef, c.req.param('id') || '')
  if (!meta) return c.notFound()

  if (!isDocumentServerConfigured()) {
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>Indobase Workspace</title>
      <body style="font-family:system-ui;padding:40px;color:#0f172a">
      <h1>Editor unavailable</h1>
      <p>The document service is not configured. Files are still listed in Workspace.</p>
      <p><a href="/">Back to Workspace</a></p></body>`
    )
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }

  const map = workspaceMapFromSession(session)
  const editor = buildEditorConfig({ file: meta, session, handoffSecret: secret })
  return c.html(
    renderEditorPage({
      session,
      map,
      fileName: meta.name,
      editor,
      studioUrl: session.studioUrl || STUDIO_URL,
    })
  )
})

// ── Workspace shell routes ───────────────────────────────────────────────────

function renderModulePage(c: Context, moduleId?: string) {
  const session = sessionFromRequest(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const map = workspaceMapFromSession(session)
  const active =
    moduleId && isSuiteModuleId(moduleId) && moduleId !== 'mail' ? moduleId : 'files'
  return c.html(
    renderWorkspaceShell({
      session,
      map,
      activeModule: active,
      studioUrl: session.studioUrl || STUDIO_URL,
    })
  )
}

app.get('/', (c) => {
  const session = sessionFromRequest(c)
  if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
  const map = workspaceMapFromSession(session)
  return c.redirect(workspaceHomePath(map))
})

app.get('/s/:team/:project', (c) => renderModulePage(c, 'files'))

app.get('/s/:team/:project/:module', (c) => {
  const mod = c.req.param('module')
  if (mod === 'mail') {
    const session = sessionFromRequest(c)
    if (!session) return c.redirect(`${STUDIO_URL}/sign-in`)
    return c.redirect(
      `${STUDIO_URL}/project/${encodeURIComponent(session.projectRef)}/workspace?open=mail`
    )
  }
  return renderModulePage(c, mod)
})

// ── Document engine reverse proxy (same-origin /ds + native paths) ───────────

async function proxyDocumentServer(c: Context) {
  const url = new URL(c.req.url)
  if (isDocumentWelcomePath(url.pathname)) {
    return blockDocumentWelcome(c)
  }
  const upstream = documentServerUpstream()
  if (!upstream) return c.notFound()
  const upstreamPath = documentServerUpstreamPath(url.pathname)
  const target = `${upstream}${upstreamPath}${url.search}`

  // Forward a minimal header set. Force identity encoding so Node/undici does not
  // auto-decompress while leaving mismatched Content-Length / Transfer-Encoding —
  // that was truncating /ds/web-apps assets through Traefik (HTTP/2 INTERNAL_ERROR).
  const headers = new Headers()
  const incoming = c.req.raw.headers
  for (const name of [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'cookie',
    'if-none-match',
    'if-modified-since',
    'range',
    'user-agent',
  ]) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('accept-encoding', 'identity')

  let res: Response
  try {
    res = await fetch(target, {
      method: c.req.method,
      headers,
      body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
      redirect: 'manual',
    })
  } catch (err) {
    console.error('[workspace] document proxy upstream error:', err)
    return c.text('document service unavailable', 502)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  const out = new Headers()
  res.headers.forEach((value, key) => {
    if (PROXY_SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) return
    out.set(key, value)
  })
  const location = res.headers.get('location')
  if (location) {
    out.set('location', rewriteDocumentServerLocation(location, url.pathname))
  }
  out.set('content-length', String(buf.byteLength))
  return new Response(buf, { status: res.status, headers: out })
}

app.all('/ds', (c) => proxyDocumentServer(c))
app.all('/ds/*', (c) => proxyDocumentServer(c))

app.all('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname
  if (isDocumentServerProxyPath(pathname) && !pathname.startsWith('/ds')) {
    return proxyDocumentServer(c)
  }
  return next()
})

export function startWorkspaceBridge(listenPort = Number(process.env.PORT || 8093)) {
  return serve({ fetch: app.fetch, port: listenPort }, () => {
    console.log(`[indobase-workspace] listening on :${listenPort}`)
    console.log(
      `[indobase-workspace] editor=${isDocumentServerConfigured() ? 'configured' : 'dev-shell-only'} meetings=${isMeetingsConfigured() ? 'configured' : 'off'} calendar=${isCalendarConfigured() ? 'configured' : 'off'}`
    )
  })
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  startWorkspaceBridge()
}

export default app
