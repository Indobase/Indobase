/**
 * Control Center authorization — OS session is the only authority.
 * projectRef in the query/header is a client hint, never a tenant selector.
 */
import { sanitizeAppId } from '../pocketbase/managed.js'

export type ControlCenterSession = {
  projectRef: string
}

export type ControlCenterAuthOk = { ok: true; projectRef: string }
export type ControlCenterAuthDenied = {
  ok: false
  status: 401 | 403
  code: 'unauthorized' | 'account_required' | 'forbidden'
}
export type ControlCenterAuth = ControlCenterAuthOk | ControlCenterAuthDenied

function norm(ref: string): string {
  return ref.trim().toLowerCase()
}

export function sameProjectRef(sessionRef: string, requestedRef: string): boolean {
  const a = norm(sessionRef)
  const b = norm(requestedRef)
  if (!a || !b) return false
  if (a === b) return true
  return sanitizeAppId(a) === sanitizeAppId(b)
}

/**
 * OS member session is AUTHORITY. Client projectRef is DERIVED/REJECTED:
 * conflict → 403, never a tenant override.
 * Anonymous catalog is a published-storefront read — not a client-controlled tenant selector.
 */
export function resolveTenantProjectRef(input: {
  session: ControlCenterSession | null
  guest?: boolean
  clientProjectRef?: string | null
  /** Public storefront ABI — no OS cookie. */
  allowAnonymousClient?: boolean
}): ControlCenterAuth | { ok: false; status: 400; code: 'invalid_request' } {
  const client = (input.clientProjectRef || '').trim()
  if (input.session?.projectRef?.trim() && !input.guest) {
    return authorizeControlCenterAccess({
      session: input.session,
      guest: input.guest,
      requestedProjectRef: client,
    })
  }
  if (input.allowAnonymousClient) {
    const ref = sanitizeAppId(client)
    if (!ref) return { ok: false, status: 400, code: 'invalid_request' }
    return { ok: true, projectRef: ref }
  }
  return { ok: false, status: 401, code: 'unauthorized' }
}

export type PublicCatalogAuth =
  | ControlCenterAuthOk
  | ControlCenterAuthDenied
  | { ok: false; status: 400 | 404; code: 'invalid_request' | 'not_published' }

/**
 * Anonymous GET catalog: only a published/preview storefront for that ref.
 * OS session cookies on /live/{ref}/ must not 403 a public catalog read.
 */
export function resolvePublicCatalogProjectRef(input: {
  session: ControlCenterSession | null
  guest?: boolean
  clientProjectRef?: string | null
  isPublished: (projectRef: string) => boolean
}): PublicCatalogAuth {
  const raw = (input.clientProjectRef || '').trim()
  if (!raw) return { ok: false, status: 400, code: 'invalid_request' }
  const ref = sanitizeAppId(raw)
  if (!ref) return { ok: false, status: 400, code: 'invalid_request' }
  if (!input.isPublished(ref)) {
    return { ok: false, status: 404, code: 'not_published' }
  }
  return { ok: true, projectRef: ref }
}

export function authorizeControlCenterAccess(input: {
  session: ControlCenterSession | null
  guest?: boolean
  requestedProjectRef?: string | null
}): ControlCenterAuth {
  if (!input.session?.projectRef?.trim()) {
    return { ok: false, status: 401, code: 'unauthorized' }
  }
  if (input.guest) {
    return { ok: false, status: 403, code: 'account_required' }
  }
  const bound = input.session.projectRef.trim()
  const requested = (input.requestedProjectRef || '').trim()
  if (requested && !sameProjectRef(bound, requested)) {
    return { ok: false, status: 403, code: 'forbidden' }
  }
  return { ok: true, projectRef: bound }
}
