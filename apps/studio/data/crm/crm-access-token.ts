import { handleError, post } from 'data/fetchers'

/**
 * Short-lived project token for Indobase CRM.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * The RLS policies in the `crm` schema resolve the caller through a member-lookup function that
 * matches `crm.members.gotrue_id` against the JWT's `sub`. So every CRM request has to arrive at
 * PostgREST carrying a token that
 *
 *   a) is signed with the *project's* JWT secret (Studio's own session token is signed by the
 *      platform GoTrue with a different secret — projects have per-project secrets, see
 *      `lib/api/saas/project-jwt`), and
 *   b) has `role = authenticated` and `sub = <the signed-in Studio user's gotrue id>`.
 *
 * `role = service_role` is NOT acceptable here. service_role bypasses RLS, and the whole point of
 * a native CRM is that isolation must be the database's job. A service-role client would silently
 * return every project's contacts and deals to every caller.
 *
 * This module is a copy of `data/discuss/discuss-access-token.ts`, pointed at the same
 * `POST /platform/projects/{ref}/api-keys/temporary` operation.
 *
 * IT FAILS CLOSED. If the platform hands back anything other than a token for this exact user with
 * `role = authenticated`, `assertUserScopedToken` throws instead of letting the app run with wider
 * privileges than it asked for.
 */

type ProjectRef = string

export interface CrmAccessToken {
  token: string
  expiryTimeMs: number
}

/** Long enough to cover a page of scrolling, short enough to be uninteresting if it leaks. */
const CRM_TOKEN_EXPIRY_SECONDS = 900

export interface CrmTokenIdentity {
  projectRef: ProjectRef
  /** The signed-in Studio user's GoTrue id — `profile.gotrue_id`. */
  gotrueId: string
  email?: string
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return atob(withPadding)
}

/** Reads a JWT payload without verifying it. Used only to refuse over-privileged tokens. */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>
  } catch {
    return null
  }
}

export class CrmTokenScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrmTokenScopeError'
  }
}

/**
 * Refuses to hand back a token that is not scoped to this user as `authenticated`.
 *
 * If this throws, the deployment's `POST /platform/projects/{ref}/api-keys/temporary` handler is
 * ignoring the `claims` parameter and returning a service key. CRM must not run on that token: RLS
 * would not apply and tenant isolation would be gone.
 *
 * When `projectRef` is provided, the JWT must also carry a matching `project_ref` claim — that is
 * what the member-lookup function uses to keep projects isolated on a shared database.
 */
export function assertUserScopedToken(
  token: string,
  gotrueId: string,
  projectRef?: string
): string {
  const claims = decodeJwtClaims(token)

  if (claims === null) {
    throw new CrmTokenScopeError(
      'CRM received a project token it could not read. Expected a JWT with role "authenticated".'
    )
  }

  if (claims.role !== 'authenticated') {
    throw new CrmTokenScopeError(
      `CRM received a project token with role "${String(claims.role)}" instead of ` +
        '"authenticated". Refusing to continue: row level security would not be applied to this ' +
        'session, so contacts and deals would not be isolated. The temporary API key endpoint ' +
        'must honour the requested claims.'
    )
  }

  if (claims.sub !== gotrueId) {
    throw new CrmTokenScopeError(
      'CRM received a project token issued for a different user. Refusing to continue: the ' +
        'member lookup would resolve the wrong member.'
    )
  }

  if (projectRef) {
    if (typeof claims.project_ref !== 'string' || !claims.project_ref) {
      throw new CrmTokenScopeError(
        'CRM received a project token without a project_ref claim. Refusing to continue: ' +
          'multitenant RLS cannot scope membership to this project.'
      )
    }
    if (claims.project_ref !== projectRef) {
      throw new CrmTokenScopeError(
        'CRM received a project token for a different project_ref. Refusing to continue.'
      )
    }
  }

  return token
}

export async function mintCrmAccessToken(
  { projectRef, gotrueId, email }: CrmTokenIdentity,
  expiryInSeconds: number = CRM_TOKEN_EXPIRY_SECONDS
): Promise<CrmAccessToken> {
  if (!projectRef) throw new Error('projectRef is required')
  if (!gotrueId) throw new Error('gotrueId is required')

  const { data, error } = await post('/platform/projects/{ref}/api-keys/temporary', {
    params: {
      path: { ref: projectRef },
      query: {
        authorization_exp: expiryInSeconds.toString(),
        claims: JSON.stringify({
          role: 'authenticated',
          aud: 'authenticated',
          sub: gotrueId,
          ...(email ? { email } : {}),
        }),
      },
    },
  })

  if (error) handleError(error)

  const token = assertUserScopedToken(data.api_key, gotrueId, projectRef)

  return { token, expiryTimeMs: Date.now() + expiryInSeconds * 1000 }
}

export function isCrmAccessTokenValid(
  token: CrmAccessToken | null | undefined
): token is CrmAccessToken {
  if (!token) return false
  // Same 20s safety margin as `isTemporaryApiKeyValid`.
  return token.expiryTimeMs - Date.now() > 20_000
}

const crmTokens = new Map<string, Promise<CrmAccessToken>>()

const cacheKeyFor = ({ projectRef, gotrueId }: CrmTokenIdentity) => `${projectRef}::${gotrueId}`

const checkOrRefresh = async (
  identity: CrmTokenIdentity,
  existing: Promise<CrmAccessToken> | undefined
): Promise<CrmAccessToken> => {
  const resolved = await existing?.catch(() => undefined)
  if (isCrmAccessTokenValid(resolved)) return resolved
  return mintCrmAccessToken(identity)
}

/**
 * Never mark this `async` — it must return a promise synchronously so concurrent callers share one
 * in-flight mint rather than each triggering their own (same reasoning as
 * `getOrRefreshTemporaryApiKey`).
 */
export function getOrRefreshCrmAccessToken(identity: CrmTokenIdentity): Promise<CrmAccessToken> {
  const key = cacheKeyFor(identity)
  const next = checkOrRefresh(identity, crmTokens.get(key))
  crmTokens.set(key, next)
  return next
}

/** Drops the cached token, e.g. after a role change. Exported for tests and for sign-out. */
export function clearCrmAccessToken(identity: CrmTokenIdentity) {
  crmTokens.delete(cacheKeyFor(identity))
}
