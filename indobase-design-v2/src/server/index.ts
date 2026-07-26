/**
 * Indobase Design — API server.
 *
 * Written for Indobase; it does NOT reuse the upstream editor's server (that one targets Cloudflare
 * Workers + D1 and depends on closed-source @clawnify/* packages). Only the editor client is ported.
 *
 * Two things differ from upstream by design:
 *   1. Multi-tenant. Upstream is single-user: every row is global. Here EVERY query is scoped by
 *      (gotrue_id, project_ref) from the verified session — never from user input — so one tenant
 *      can never read or mutate another's designs.
 *   2. Studio SSO instead of no auth.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'

import {
  clearSessionCookie,
  createSessionToken,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  sessionCookie,
  verifyStudioHandoff,
  type Session,
} from './auth.js'
import { migrate, one, query } from './db.js'
import { seedTemplates } from './seed.js'

type Vars = { session: Session }
const app = new Hono<{ Variables: Vars }>()

const STUDIO_URL = (process.env.STUDIO_URL || 'https://studio.indobase.in').replace(/\/+$/, '')

// ── SSO ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Studio hands off here: /sso/launch#token=<jwt>. The token rides in the URL *fragment* so it is
 * never sent to the server in a request line (and so never lands in access logs or Referer); the
 * page below posts it to /sso/session instead.
 */
app.get('/sso/launch', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Opening Indobase Design…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#4a4458">
<p>Opening Indobase Design…</p>
<script>
(async () => {
  var h = new URLSearchParams(location.hash.slice(1));
  var t = h.get('token');
  if (!t) { location.replace(${JSON.stringify(STUDIO_URL)} + '/sign-in'); return; }
  history.replaceState(null, '', '/sso/launch');
  var r = await fetch('/sso/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t })
  });
  location.replace(r.ok ? '/' : ${JSON.stringify(STUDIO_URL)} + '/sign-in');
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
    console.error('[sso] handoff secret misconfigured:', err)
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

// ── Auth middleware ──────────────────────────────────────────────────────────────────────────────

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

/** Viewers get read-only access; anything mutating requires an editor role. */
async function requireEditor(c: Context<{ Variables: Vars }>, next: Next) {
  if (!c.get('session').canEdit) {
    return c.json({ error: 'Your role has view-only access to Design' }, 403)
  }
  await next()
}

app.use('/api/*', requireSession)
app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '/api/*', requireEditor)

// ── Designs ──────────────────────────────────────────────────────────────────────────────────────

const DESIGN_COLS = `id, name, canvas_json, width, height, thumbnail_url, created_at, updated_at`

app.get('/api/designs', async (c) => {
  const s = c.get('session')
  const rows = await query(
    `select ${DESIGN_COLS} from design.designs
      where project_ref = $1 and gotrue_id = $2
      order by updated_at desc limit 200`,
    [s.projectRef, s.gotrueId]
  )
  return c.json(rows)
})

app.post('/api/designs', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const canvasJson = JSON.stringify(body.canvas_json ?? {})
  const row = await one(
    `insert into design.designs (gotrue_id, project_ref, org_slug, name, canvas_json, width, height)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${DESIGN_COLS}`,
    [
      s.gotrueId,
      s.projectRef,
      s.orgSlug || null,
      typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled design',
      canvasJson,
      Number(body.width) || 1080,
      Number(body.height) || 1080,
    ]
  )
  if (!row) return c.json({ error: 'create failed' }, 500)
  // Every design needs at least one page — editor canvases are page-scoped.
  await one(
    `insert into design.pages (design_id, title, canvas_json, sort_order)
     values ($1, 'Page 1', $2::jsonb, 0)
     returning id`,
    [(row as { id: string }).id, canvasJson]
  )
  return c.json(row, 201)
})

app.get('/api/designs/:id', async (c) => {
  const s = c.get('session')
  // Ownership is in the WHERE clause, not checked after the fetch — a not-found and a
  // not-yours are indistinguishable to the caller, which is what we want.
  const design = await one(
    `select ${DESIGN_COLS} from design.designs
      where id = $1 and project_ref = $2 and gotrue_id = $3`,
    [c.req.param('id'), s.projectRef, s.gotrueId]
  )
  if (!design) return c.json({ error: 'not found' }, 404)

  const pages = await query(
    `select id, design_id, title, canvas_json, sort_order, created_at
       from design.pages where design_id = $1 order by sort_order`,
    [c.req.param('id')]
  )
  return c.json({ ...(design as object), pages })
})

app.put('/api/designs/:id', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const row = await one(
    `update design.designs set
       name          = coalesce($4, name),
       canvas_json   = coalesce($5::jsonb, canvas_json),
       width         = coalesce($6, width),
       height        = coalesce($7, height),
       thumbnail_url = coalesce($8, thumbnail_url)
     where id = $1 and project_ref = $2 and gotrue_id = $3
     returning ${DESIGN_COLS}`,
    [
      c.req.param('id'),
      s.projectRef,
      s.gotrueId,
      typeof body.name === 'string' ? body.name : null,
      body.canvas_json === undefined ? null : JSON.stringify(body.canvas_json),
      body.width === undefined ? null : Number(body.width),
      body.height === undefined ? null : Number(body.height),
      typeof body.thumbnail_url === 'string' ? body.thumbnail_url : null,
    ]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

app.delete('/api/designs/:id', async (c) => {
  const s = c.get('session')
  const row = await one(
    `delete from design.designs
      where id = $1 and project_ref = $2 and gotrue_id = $3 returning id`,
    [c.req.param('id'), s.projectRef, s.gotrueId]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ── Pages ────────────────────────────────────────────────────────────────────────────────────────

/** Confirm the parent design belongs to this session before touching any page. */
async function ownsDesign(s: Session, designId: string): Promise<boolean> {
  const row = await one(
    `select 1 as ok from design.designs where id = $1 and project_ref = $2 and gotrue_id = $3`,
    [designId, s.projectRef, s.gotrueId]
  )
  return Boolean(row)
}

app.post('/api/pages', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const designId = String(body.design_id ?? '')
  if (!designId || !(await ownsDesign(s, designId))) return c.json({ error: 'not found' }, 404)

  const row = await one(
    `insert into design.pages (design_id, title, canvas_json, sort_order)
     values ($1, $2, $3, $4)
     returning id, design_id, title, canvas_json, sort_order, created_at`,
    [
      designId,
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Page',
      JSON.stringify(body.canvas_json ?? {}),
      Number(body.sort_order) || 0,
    ]
  )
  return c.json(row, 201)
})

app.put('/api/pages/:id', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  // Join through designs so a page can only be updated by its owner.
  const row = await one(
    `update design.pages p set
       title       = coalesce($3, p.title),
       canvas_json = coalesce($4::jsonb, p.canvas_json),
       sort_order  = coalesce($5, p.sort_order)
     from design.designs d
     where p.id = $1 and p.design_id = d.id and d.project_ref = $2 and d.gotrue_id = $6
     returning p.id, p.design_id, p.title, p.canvas_json, p.sort_order, p.created_at`,
    [
      c.req.param('id'),
      s.projectRef,
      typeof body.title === 'string' ? body.title : null,
      body.canvas_json === undefined ? null : JSON.stringify(body.canvas_json),
      body.sort_order === undefined ? null : Number(body.sort_order),
      s.gotrueId,
    ]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

app.delete('/api/pages/:id', async (c) => {
  const s = c.get('session')
  const row = await one(
    `delete from design.pages p
      using design.designs d
      where p.id = $1 and p.design_id = d.id and d.project_ref = $2 and d.gotrue_id = $3
      returning p.id`,
    [c.req.param('id'), s.projectRef, s.gotrueId]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ── Templates (global library — readable by every tenant) ────────────────────────────────────────

app.get('/api/templates', async (c) => {
  const rows = await query(
    `select id, slug, name, category, canvas_json, width, height, thumbnail_url, sort_order
       from design.templates
      where gotrue_id is null
      order by sort_order, name`
  )
  return c.json(rows)
})

// ── Session (who am I) ───────────────────────────────────────────────────────────────────────────

app.get('/api/me', (c) => {
  const s = c.get('session')
  return c.json({
    email: s.email,
    projectRef: s.projectRef,
    orgSlug: s.orgSlug,
    role: s.role,
    canEdit: s.canEdit,
  })
})

// ── Brand kit ────────────────────────────────────────────────────────────────────────────────────

const BRAND_COLS = `id, name, primary_color, secondary_color, accent_color, background_color,
  text_color, font_display, font_body, logo_url, created_at, updated_at`

function sanitizeColor(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback
  const t = v.trim()
  if (/^#[0-9A-Fa-f]{3,8}$/.test(t)) return t
  return fallback
}

function sanitizeFont(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback
  const t = v.trim().slice(0, 64)
  return t || fallback
}

app.get('/api/brand-kit', async (c) => {
  const s = c.get('session')
  const row = await one(
    `select ${BRAND_COLS} from design.brand_kits
      where project_ref = $1 and gotrue_id = $2`,
    [s.projectRef, s.gotrueId]
  )
  if (row) return c.json(row)
  // Sensible Indobase defaults when none saved yet.
  return c.json({
    id: null,
    name: 'Brand kit',
    primary_color: '#3B8FD6',
    secondary_color: '#F5A524',
    accent_color: '#E8618C',
    background_color: '#FFFFFF',
    text_color: '#111827',
    font_display: 'Montserrat',
    font_body: 'Inter',
    logo_url: null,
    created_at: null,
    updated_at: null,
  })
})

app.put('/api/brand-kit', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const row = await one(
    `insert into design.brand_kits (
       gotrue_id, project_ref, org_slug, name,
       primary_color, secondary_color, accent_color, background_color, text_color,
       font_display, font_body, logo_url
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (project_ref, gotrue_id) do update set
       name = excluded.name,
       primary_color = excluded.primary_color,
       secondary_color = excluded.secondary_color,
       accent_color = excluded.accent_color,
       background_color = excluded.background_color,
       text_color = excluded.text_color,
       font_display = excluded.font_display,
       font_body = excluded.font_body,
       logo_url = excluded.logo_url,
       org_slug = excluded.org_slug,
       updated_at = now()
     returning ${BRAND_COLS}`,
    [
      s.gotrueId,
      s.projectRef,
      s.orgSlug || null,
      typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Brand kit',
      sanitizeColor(body.primary_color, '#3B8FD6'),
      sanitizeColor(body.secondary_color, '#F5A524'),
      sanitizeColor(body.accent_color, '#E8618C'),
      sanitizeColor(body.background_color, '#FFFFFF'),
      sanitizeColor(body.text_color, '#111827'),
      sanitizeFont(body.font_display, 'Montserrat'),
      sanitizeFont(body.font_body, 'Inter'),
      typeof body.logo_url === 'string' && body.logo_url.trim() ? body.logo_url.trim().slice(0, 2000) : null,
    ]
  )
  return c.json(row)
})

// ── AI draft (proxies to Studio OpenRouter) ──────────────────────────────────────────────────────

app.post('/api/ai/draft', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt.length < 3) return c.json({ error: 'Prompt is required' }, 400)

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.json({ error: 'sso not configured' }, 503)
  }

  try {
    const { proxyAiDraft } = await import('./ai-draft.js')
    const draft = await proxyAiDraft({
      session: s,
      secret,
      prompt,
      width: body.width === undefined ? undefined : Number(body.width),
      height: body.height === undefined ? undefined : Number(body.height),
      category: typeof body.category === 'string' ? body.category : undefined,
    })
    return c.json(draft)
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status) || 502
        : 502
    const message = err instanceof Error ? err.message : 'AI draft failed'
    const bodyPayload =
      err && typeof err === 'object' && 'body' in err
        ? (err as { body?: Record<string, unknown> }).body
        : undefined
    return c.json({ error: message, ...(bodyPayload || {}) }, status as 400)
  }
})

// ── Data merge helpers ───────────────────────────────────────────────────────────────────────────

app.post('/api/merge/preview', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    canvas?: { objects?: unknown[]; [k: string]: unknown }
    data?: Record<string, string | number | null | undefined>
  }
  if (!body.canvas || typeof body.canvas !== 'object') {
    return c.json({ error: 'canvas is required' }, 400)
  }
  const { mergePlaceholders, extractPlaceholderKeys } = await import('./ai-draft.js')
  const keys = extractPlaceholderKeys(body.canvas)
  const merged = mergePlaceholders(body.canvas, body.data || {})
  return c.json({ keys, canvas: merged })
})

// ── Uploads (data-URL for canvas images — no object storage dependency) ───────────────────────────

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

app.post('/api/uploads', async (c) => {
  const s = c.get('session')
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: 'expected multipart form with file' }, 400)
  }
  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'file is required' }, 400)
  }
  const blob = file as File
  if (!blob.type.startsWith('image/')) {
    return c.json({ error: 'only image uploads are supported' }, 400)
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'image must be under 4 MB' }, 400)
  }
  const buf = Buffer.from(await blob.arrayBuffer())
  const url = `data:${blob.type};base64,${buf.toString('base64')}`
  // Persist URL for recent-assets list when under ~1.2MB decoded (Postgres-friendly).
  const persistUrl = blob.size <= 1_200_000 ? url : null
  const row = await one(
    `insert into design.uploads (gotrue_id, project_ref, mime_type, byte_size, storage_key, asset_url)
     values ($1, $2, $3, $4, $5, $6)
     returning id, mime_type, byte_size, created_at, asset_url`,
    [s.gotrueId, s.projectRef, blob.type, blob.size, `data-url:${blob.name || 'image'}`, persistUrl]
  )
  return c.json({ ...(row as object), url }, 201)
})

app.get('/api/uploads', async (c) => {
  const s = c.get('session')
  const rows = await query(
    `select id, mime_type, byte_size, created_at, asset_url as url
       from design.uploads
      where project_ref = $1 and gotrue_id = $2 and asset_url is not null
      order by created_at desc limit 40`,
    [s.projectRef, s.gotrueId]
  )
  return c.json(rows)
})

// ── Folders ──────────────────────────────────────────────────────────────────────────────────────

app.get('/api/folders', async (c) => {
  const s = c.get('session')
  const rows = await query(
    `select id, name, created_at from design.folders
      where project_ref = $1 and gotrue_id = $2
      order by name`,
    [s.projectRef, s.gotrueId]
  )
  return c.json(rows)
})

app.post('/api/folders', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as { name?: string }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Folder'
  const row = await one(
    `insert into design.folders (gotrue_id, project_ref, name) values ($1,$2,$3)
     returning id, name, created_at`,
    [s.gotrueId, s.projectRef, name]
  )
  return c.json(row, 201)
})

app.put('/api/designs/:id/folder', async (c) => {
  const s = c.get('session')
  const body = (await c.req.json().catch(() => ({}))) as { folder_id?: string | null }
  const folderId = body.folder_id === null || body.folder_id === undefined ? null : String(body.folder_id)
  if (folderId) {
    const ok = await one(
      `select 1 as ok from design.folders where id = $1 and project_ref = $2 and gotrue_id = $3`,
      [folderId, s.projectRef, s.gotrueId]
    )
    if (!ok) return c.json({ error: 'folder not found' }, 404)
  }
  const row = await one(
    `update design.designs set folder_id = $4
      where id = $1 and project_ref = $2 and gotrue_id = $3
      returning id, folder_id`,
    [c.req.param('id'), s.projectRef, s.gotrueId, folderId]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

// ── Version history ──────────────────────────────────────────────────────────────────────────────

app.get('/api/designs/:id/versions', async (c) => {
  const s = c.get('session')
  if (!(await ownsDesign(s, c.req.param('id')))) return c.json({ error: 'not found' }, 404)
  const rows = await query(
    `select id, label, width, height, created_at from design.versions
      where design_id = $1 order by created_at desc limit 40`,
    [c.req.param('id')]
  )
  return c.json(rows)
})

app.post('/api/designs/:id/versions', async (c) => {
  const s = c.get('session')
  const designId = c.req.param('id')
  if (!(await ownsDesign(s, designId))) return c.json({ error: 'not found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const row = await one(
    `insert into design.versions (design_id, label, canvas_json, width, height)
     values ($1, $2, $3::jsonb, $4, $5)
     returning id, label, width, height, created_at`,
    [
      designId,
      typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : 'Snapshot',
      JSON.stringify(body.canvas_json ?? {}),
      Number(body.width) || 1080,
      Number(body.height) || 1080,
    ]
  )
  return c.json(row, 201)
})

app.post('/api/designs/:id/versions/:vid/restore', async (c) => {
  const s = c.get('session')
  const designId = c.req.param('id')
  if (!(await ownsDesign(s, designId))) return c.json({ error: 'not found' }, 404)
  const ver = await one<{ canvas_json: unknown; width: number; height: number }>(
    `select canvas_json, width, height from design.versions where id = $1 and design_id = $2`,
    [c.req.param('vid'), designId]
  )
  if (!ver) return c.json({ error: 'not found' }, 404)
  await one(
    `update design.designs set canvas_json = $2::jsonb, width = $3, height = $4
      where id = $1`,
    [designId, JSON.stringify(ver.canvas_json), ver.width, ver.height]
  )
  // Also update first page if present.
  await query(
    `update design.pages set canvas_json = $2::jsonb
      where design_id = $1 and sort_order = (
        select min(sort_order) from design.pages where design_id = $1
      )`,
    [designId, JSON.stringify(ver.canvas_json)]
  )
  return c.json({ ok: true, canvas_json: ver.canvas_json, width: ver.width, height: ver.height })
})

// ── Share links ──────────────────────────────────────────────────────────────────────────────────

app.post('/api/designs/:id/share', async (c) => {
  const s = c.get('session')
  const designId = c.req.param('id')
  if (!(await ownsDesign(s, designId))) return c.json({ error: 'not found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { can_edit?: boolean }
  const token = cryptoRandomToken()
  const row = await one(
    `insert into design.share_links (design_id, gotrue_id, project_ref, token, can_edit)
     values ($1,$2,$3,$4,$5)
     returning id, token, can_edit, created_at`,
    [designId, s.gotrueId, s.projectRef, token, Boolean(body.can_edit)]
  )
  return c.json({
    ...(row as object),
    url: `/share/${token}`,
  }, 201)
})

app.get('/api/share/:token', async (c) => {
  // Public-ish read via share token — still requires session for now (SSO-only product),
  // but any authenticated project member with the link can open the snapshot.
  const s = c.get('session')
  const link = await one<{
    design_id: string
    can_edit: boolean
    project_ref: string
  }>(
    `select design_id, can_edit, project_ref from design.share_links
      where token = $1 and (expires_at is null or expires_at > now())`,
    [c.req.param('token')]
  )
  if (!link) return c.json({ error: 'invalid share link' }, 404)
  if (link.project_ref !== s.projectRef) {
    return c.json({ error: 'share link belongs to another project' }, 403)
  }
  const design = await one(
    `select ${DESIGN_COLS} from design.designs where id = $1`,
    [link.design_id]
  )
  if (!design) return c.json({ error: 'not found' }, 404)
  return c.json({ design, can_edit: link.can_edit && s.canEdit })
})

// ── Comments ─────────────────────────────────────────────────────────────────────────────────────

app.get('/api/designs/:id/comments', async (c) => {
  const s = c.get('session')
  if (!(await ownsDesign(s, c.req.param('id')))) return c.json({ error: 'not found' }, 404)
  const rows = await query(
    `select id, author_email, body, x, y, created_at from design.comments
      where design_id = $1 order by created_at asc limit 200`,
    [c.req.param('id')]
  )
  return c.json(rows)
})

app.post('/api/designs/:id/comments', async (c) => {
  const s = c.get('session')
  const designId = c.req.param('id')
  if (!(await ownsDesign(s, designId))) return c.json({ error: 'not found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as {
    body?: string
    x?: number
    y?: number
  }
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : ''
  if (!text) return c.json({ error: 'comment body required' }, 400)
  const row = await one(
    `insert into design.comments (design_id, gotrue_id, author_email, body, x, y)
     values ($1,$2,$3,$4,$5,$6)
     returning id, author_email, body, x, y, created_at`,
    [
      designId,
      s.gotrueId,
      s.email,
      text,
      body.x === undefined ? null : Number(body.x),
      body.y === undefined ? null : Number(body.y),
    ]
  )
  return c.json(row, 201)
})

function cryptoRandomToken(): string {
  return randomBytes(24).toString('hex')
}

// ── Health ───────────────────────────────────────────────────────────────────────────────────────

app.get('/healthz', async (c) => {
  try {
    await query('select 1')
    return c.json({
      ok: true,
      service: 'indobase-design',
      version: process.env.DESIGN_VERSION || process.env.GIT_SHA || 'dev',
    })
  } catch {
    return c.json({ ok: false, service: 'indobase-design' }, 503)
  }
})

app.get('/sso/health', (c) =>
  c.json({
    ok: true,
    service: 'indobase-design',
    version: process.env.DESIGN_VERSION || process.env.GIT_SHA || 'dev',
    studioUrl: STUDIO_URL,
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

// ── Static SPA ───────────────────────────────────────────────────────────────────────────────────

const spaIndexHtml = (() => {
  try {
    return readFileSync('./dist/index.html', 'utf8')
  } catch {
    return '<!doctype html><title>Indobase Design</title><p>Build missing — run vite build.</p>'
  }
})()

app.use('/assets/*', serveStatic({ root: './dist' }))

/** Gate the SPA: no public auth UI — unauthenticated browsers go to Studio sign-in. */
app.get('*', (c) => {
  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  const raw = readCookie(c.req.header('cookie'))
  const session = raw ? readSessionToken(raw, secret) : null
  if (!session) {
    return c.redirect(`${STUDIO_URL}/sign-in`)
  }
  return c.html(spaIndexHtml)
})

// ── Boot ─────────────────────────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT || 8080)

async function main() {
  // Fail fast on misconfiguration rather than serving an unauthenticated app.
  resolveHandoffSecret()
  await migrate()
  const seeded = await seedTemplates()
  serve({ fetch: app.fetch, port })
  console.log(`[indobase-design] listening on :${port} (${seeded} built-in templates)`)
}

main().catch((err) => {
  console.error('[indobase-design] failed to start:', err)
  process.exit(1)
})

export default app
