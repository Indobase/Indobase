import { createClient, type IndobaseClient } from '@indobaseinc/indobase-js'

import { getOrRefreshDiscussAccessToken } from './discuss-access-token'
import type { DiscussDatabase } from './discuss.types'

/**
 * The PostgREST/Realtime client every Discuss read and write goes through.
 *
 * It talks to the project's own API endpoint with the project's publishable key as `apikey` and a
 * short-lived `authenticated` token as the bearer (see `discuss-access-token`). That means:
 *
 *  - RLS is applied by Postgres on every statement. Nothing in `data/discuss/` filters by
 *    `project_ref`; the policies already do, and a hand-written filter that disagrees with them is
 *    worse than none.
 *  - Realtime replays the same policies per subscriber, so a client only receives rows it could
 *    have SELECTed. There is no second access-control system to keep in sync.
 *
 * `db.schema` is pinned to `discuss`, so `.from('channels')` resolves to `discuss.channels`.
 */
export type DiscussClient = IndobaseClient<DiscussDatabase, 'discuss'>

export type DiscussClientVariables = {
  projectRef?: string
  /** Project API endpoint, e.g. from `useProjectEndpointQuery`. */
  endpoint?: string
  /** Project publishable (or legacy anon) key, e.g. from `getKeys(useAPIKeysQuery(...).data)`. */
  apiKey?: string
  /** The signed-in Studio user's `profile.gotrue_id`. */
  gotrueId?: string
  email?: string
}

export type ResolvedDiscussClientVariables = {
  projectRef: string
  endpoint: string
  apiKey: string
  gotrueId: string
  email?: string
}

/**
 * Narrows the loosely-typed variables the hooks carry around. Throws with a specific message rather
 * than returning undefined, because a Discuss surface that renders "no channels" when it actually
 * failed to build a client is the exact bug that made the forks impossible to debug.
 */
export function resolveDiscussClientVariables(
  vars: DiscussClientVariables
): ResolvedDiscussClientVariables {
  const { projectRef, endpoint, apiKey, gotrueId, email } = vars
  if (!projectRef) throw new Error('Project ref is required for Discuss')
  if (!endpoint) throw new Error('Project API endpoint is required for Discuss')
  if (!apiKey) throw new Error('Project publishable key is required for Discuss')
  if (!gotrueId) throw new Error('You must be signed in to open Discuss')
  return { projectRef, endpoint, apiKey, gotrueId, email }
}

export function hasDiscussClientVariables(
  vars: DiscussClientVariables
): vars is DiscussClientVariables & ResolvedDiscussClientVariables {
  return !!vars.projectRef && !!vars.endpoint && !!vars.apiKey && !!vars.gotrueId
}

/**
 * One client per (project, endpoint, user). Realtime holds a websocket, so handing every call a
 * fresh client would open a new socket per render.
 */
const clients = new Map<string, DiscussClient>()

export function getDiscussClient(vars: DiscussClientVariables): DiscussClient {
  const { projectRef, endpoint, apiKey, gotrueId, email } = resolveDiscussClientVariables(vars)

  const cacheKey = `${projectRef}::${endpoint}::${gotrueId}`
  const cached = clients.get(cacheKey)
  if (cached !== undefined) return cached

  const client = createClient<DiscussDatabase, 'discuss'>(endpoint, apiKey, {
    db: { schema: 'discuss' },
    // Supplying `accessToken` puts the client in "bring your own auth" mode: it never reads or
    // writes a GoTrue session of its own, and it uses this token for both PostgREST and Realtime.
    accessToken: async () => {
      const { token } = await getOrRefreshDiscussAccessToken({ projectRef, gotrueId, email })
      return token
    },
  })

  clients.set(cacheKey, client)
  return client
}
