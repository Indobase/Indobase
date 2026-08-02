import { handleError, post } from 'data/fetchers'

/**
 * Short-lived project token for Indobase Discuss.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * The RLS policies in `001_discuss_schema.sql` resolve the caller through
 * `discuss.current_member_ids()`, which matches `discuss.members.gotrue_id` against the JWT's
 * `sub`. So every Discuss request has to arrive at PostgREST carrying a token that
 *
 *   a) is signed with the *project's* JWT secret (Studio's own session token is signed by the
 *      platform GoTrue with a different secret — projects have per-project secrets, see
 *      `lib/api/saas/project-jwt`), and
 *   b) has `role = authenticated` and `sub = <the signed-in Studio user's gotrue id>`.
 *
 * `role = service_role` is NOT acceptable here. service_role bypasses RLS, and the whole reason
 * Discuss was built natively rather than forked is that isolation must be the database's job. A
 * service-role client would silently return every project's conversation to every caller.
 *
 * This module is a copy of the caching/refresh shape in `data/api-keys/temp-api-keys-utils.ts`,
 * pointed at the same `POST /platform/projects/{ref}/api-keys/temporary` operation but asking for
 * `authenticated` claims instead of `service_role`.
 *
 * IT FAILS CLOSED. If the platform hands back anything other than a token for this exact user with
 * `role = authenticated`, `assertUserScopedToken` throws instead of letting the app run with wider
 * privileges than it asked for. Silence is what killed both forks; this one is loud.
 */

type ProjectRef = string

export interface DiscussAccessToken {
  token: string
  expiryTimeMs: number
}

/** Long enough to cover a page of scrolling, short enough to be uninteresting if it leaks. */
const DISCUSS_TOKEN_EXPIRY_SECONDS = 900

export interface DiscussTokenIdentity {
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

export class DiscussTokenScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscussTokenScopeError'
  }
}

/**
 * Refuses to hand back a token that is not scoped to this user as `authenticated`.
 *
 * If this throws, the deployment's `POST /platform/projects/{ref}/api-keys/temporary` handler is
 * ignoring the `claims` parameter and returning a service key. Discuss must not run on that token:
 * RLS would not apply and channel isolation would be gone.
 *
 * When `projectRef` is provided, the JWT must also carry a matching `project_ref` claim — that is
 * what `discuss.current_member_ids()` uses to keep projects isolated on a shared database.
 */
export function assertUserScopedToken(
  token: string,
  gotrueId: string,
  projectRef?: string
): string {
  const claims = decodeJwtClaims(token)

  if (claims === null) {
    throw new DiscussTokenScopeError(
      'Discuss received a project token it could not read. Expected a JWT with role "authenticated".'
    )
  }

  if (claims.role !== 'authenticated') {
    throw new DiscussTokenScopeError(
      `Discuss received a project token with role "${String(claims.role)}" instead of ` +
        '"authenticated". Refusing to continue: row level security would not be applied to this ' +
        'session, so channels would not be isolated. The temporary API key endpoint must honour ' +
        'the requested claims.'
    )
  }

  if (claims.sub !== gotrueId) {
    throw new DiscussTokenScopeError(
      'Discuss received a project token issued for a different user. Refusing to continue: ' +
        'discuss.current_member_ids() would resolve the wrong member.'
    )
  }

  if (projectRef) {
    if (typeof claims.project_ref !== 'string' || !claims.project_ref) {
      throw new DiscussTokenScopeError(
        'Discuss received a project token without a project_ref claim. Refusing to continue: ' +
          'multitenant RLS cannot scope membership to this project.'
      )
    }
    if (claims.project_ref !== projectRef) {
      throw new DiscussTokenScopeError(
        'Discuss received a project token for a different project_ref. Refusing to continue.'
      )
    }
  }

  return token
}

export async function mintDiscussAccessToken(
  { projectRef, gotrueId, email }: DiscussTokenIdentity,
  expiryInSeconds: number = DISCUSS_TOKEN_EXPIRY_SECONDS
): Promise<DiscussAccessToken> {
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

export function isDiscussAccessTokenValid(
  token: DiscussAccessToken | null | undefined
): token is DiscussAccessToken {
  if (!token) return false
  // Same 20s safety margin as `isTemporaryApiKeyValid`.
  return token.expiryTimeMs - Date.now() > 20_000
}

const discussTokens = new Map<string, Promise<DiscussAccessToken>>()

const cacheKeyFor = ({ projectRef, gotrueId }: DiscussTokenIdentity) => `${projectRef}::${gotrueId}`

const checkOrRefresh = async (
  identity: DiscussTokenIdentity,
  existing: Promise<DiscussAccessToken> | undefined
): Promise<DiscussAccessToken> => {
  const resolved = await existing?.catch(() => undefined)
  if (isDiscussAccessTokenValid(resolved)) return resolved
  return mintDiscussAccessToken(identity)
}

/**
 * Never mark this `async` — it must return a promise synchronously so concurrent callers share one
 * in-flight mint rather than each triggering their own (same reasoning as
 * `getOrRefreshTemporaryApiKey`).
 */
export function getOrRefreshDiscussAccessToken(
  identity: DiscussTokenIdentity
): Promise<DiscussAccessToken> {
  const key = cacheKeyFor(identity)
  const next = checkOrRefresh(identity, discussTokens.get(key))
  discussTokens.set(key, next)
  return next
}

/** Drops the cached token, e.g. after a role change. Exported for tests and for sign-out. */
export function clearDiscussAccessToken(identity: DiscussTokenIdentity) {
  discussTokens.delete(cacheKeyFor(identity))
}
