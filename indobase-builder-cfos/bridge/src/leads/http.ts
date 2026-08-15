/**
 * Public enquiry endpoint for published landing pages (thin controller).
 */
import type { Context } from 'hono'

import {
  SESSION_COOKIE,
  isGuestSession,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
} from '../auth.js'
import {
  authorizeControlCenterAccess,
  resolveTenantProjectRef,
} from '../commerce/control-center-auth.js'
import { sanitizeAppId } from '../pocketbase/managed.js'
import {
  clearLeadRateLimitForTests,
  leadFailureMessage,
  listLeads,
  normalizeLead,
  normalizeLeadStatus,
  rateLimitLead,
  sanitizeLeadId,
  submitLead,
  updateLeadStatus,
} from './service.js'
import { notifyOwnerOfLead } from './notify.js'

function osSessionFromRequest(c: Context) {
  try {
    const raw = readCookie(c.req.header('cookie'), SESSION_COOKIE)
    if (!raw) return { session: null, guest: false as const }
    const session = readSessionToken(raw, resolveHandoffSecret())
    if (!session) return { session: null, guest: false as const }
    return { session, guest: isGuestSession(session) }
  } catch {
    return { session: null, guest: false as const }
  }
}

export { clearLeadRateLimitForTests }

export function leadsCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Indobase-Project-Ref',
    'Access-Control-Max-Age': '86400',
  }
}

export async function handleLeadsOptions(c: Context) {
  return c.body(null, 204, leadsCorsHeaders())
}

function clientProjectRef(c: Context, body: Record<string, unknown>): string {
  const header = (c.req.header('X-Indobase-Project-Ref') || '').trim()
  let query = (c.req.query('projectRef') || '').trim()
  if (!query) {
    try {
      query = new URL(c.req.url, 'http://localhost').searchParams.get('projectRef') || ''
    } catch {
      query = ''
    }
  }
  const fromBody = typeof body.projectRef === 'string' ? body.projectRef.trim() : ''
  const raw = header || query || fromBody
  return raw ? sanitizeAppId(raw) : ''
}

function clientKey(c: Context): string {
  const forwarded = (c.req.header('x-forwarded-for') || '').split(',')[0]?.trim()
  return forwarded || c.req.header('x-real-ip')?.trim() || 'anonymous'
}

/** Owner-only inbox: enquiries never leave the project they were sent to. */
export async function handleLeadsList(
  c: Context,
  loadLeads: (projectRef: string) => Promise<unknown> = listLeads,
) {
  const { session, guest } = osSessionFromRequest(c)
  const auth = authorizeControlCenterAccess({
    session,
    guest,
    requestedProjectRef: c.req.query('projectRef') || c.req.header('X-Indobase-Project-Ref') || '',
  })
  if (!auth.ok) return c.json({ ok: false, code: auth.code }, auth.status)
  try {
    return c.json({ ok: true, leads: await loadLeads(auth.projectRef) })
  } catch {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: leadFailureMessage('backend_unavailable') },
      502,
    )
  }
}

/** Owner triage: mark handled / reopen. Public visitors never reach this path. */
export async function handleLeadStatusUpdate(
  c: Context,
  applyStatus: typeof updateLeadStatus = updateLeadStatus,
) {
  const { session, guest } = osSessionFromRequest(c)
  const auth = authorizeControlCenterAccess({
    session,
    guest,
    requestedProjectRef: c.req.query('projectRef') || c.req.header('X-Indobase-Project-Ref') || '',
  })
  if (!auth.ok) return c.json({ ok: false, code: auth.code, message: leadFailureMessage(auth.code) }, auth.status)

  const leadId = sanitizeLeadId(c.req.param('id'))
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const status = normalizeLeadStatus(body.status)
  if (!leadId || !status) {
    return c.json(
      { ok: false, code: 'invalid_request', message: leadFailureMessage('invalid_request') },
      400,
    )
  }

  const updated = await applyStatus({
    projectRef: auth.projectRef,
    leadId,
    status,
  })
  if (!updated.ok) {
    const http =
      updated.code === 'not_found' ? 404 : updated.code === 'invalid_request' ? 400 : 503
    return c.json(
      { ok: false, code: updated.code, message: leadFailureMessage(updated.code) },
      http,
    )
  }
  return c.json({ ok: true, id: updated.id, status: updated.status })
}

export async function handleLeadSubmit(c: Context) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const bound = resolveTenantProjectRef({
    session: null,
    guest: false,
    clientProjectRef: clientProjectRef(c, body),
    allowAnonymousClient: true,
  })
  if (!bound.ok) {
    return c.json(
      { ok: false, code: bound.code, message: leadFailureMessage(bound.code) },
      bound.status,
      leadsCorsHeaders(),
    )
  }

  const validated = normalizeLead(body as never)
  if (!validated.ok) {
    return c.json(
      { ok: false, code: validated.code, message: validated.message },
      400,
      leadsCorsHeaders(),
    )
  }

  if (!rateLimitLead(`${bound.projectRef}:${clientKey(c)}`).allowed) {
    return c.json(
      { ok: false, code: 'rate_limited', message: leadFailureMessage('rate_limited') },
      429,
      leadsCorsHeaders(),
    )
  }

  const saved = await submitLead({ projectRef: bound.projectRef, lead: validated.lead })
  if (!saved.ok) {
    return c.json(
      { ok: false, code: saved.code, message: leadFailureMessage(saved.code) },
      503,
      leadsCorsHeaders(),
    )
  }

  // Owner ping is best-effort — never delay or fail the visitor thanks page.
  void notifyOwnerOfLead({ projectRef: bound.projectRef, lead: validated.lead })

  return c.json(
    { ok: true, message: 'Thanks — your enquiry is with us. We will reply shortly.' },
    200,
    leadsCorsHeaders(),
  )
}
